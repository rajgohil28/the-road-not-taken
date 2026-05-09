import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import type { AiToolName } from "../lib/aiTools";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_ROUNDS = 5;

type GeminiRole = "user" | "model";

interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      role?: GeminiRole;
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

const TOOL_DECLARATIONS = [
  {
    name: "get_state",
    description: "Get the current app state, including selectedPlayerId, selectedParticipant, selected match, current time, map layer, playback, and map view. Call this before answering questions about the current selected user/player.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "match_control",
    description: "Select, search, or move between matches by map, date, match key/id, or query.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["select", "filter", "search", "next", "previous"] },
        mapId: { type: "string", description: "Map id such as AmbroseValley, GrandRift, or Lockdown." },
        date: { type: "string", description: "Match date or all." },
        matchKey: { type: "string" },
        matchId: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "user_control",
    description: "Select, clear, or cycle the visible player/bot route.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["select", "next", "previous", "clear"] },
        userId: { type: "string" },
        actorType: { type: "string", enum: ["human", "bot"] },
      },
    },
  },
  {
    name: "playback_control",
    description: "Play, pause, restart, step, toggle playback, or change playback speed.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["play", "pause", "toggle", "restart", "step_forward", "step_back", "set_speed"] },
        seconds: { type: "number" },
        speed: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "timeline_control",
    description: "Jump to a timestamp or matching event occurrence in the selected match.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["go_to_time", "go_to_event"] },
        time: { type: "number", description: "Target time in seconds." },
        eventType: { type: "string", description: "Event type such as Killed, Kill, BotKill, KilledByStorm, or Loot." },
        occurrence: { type: "string", enum: ["first", "next", "previous", "last"] },
        userId: { type: "string" },
        selectPlayer: { type: "boolean" },
      },
      required: ["action"],
    },
  },
  {
    name: "map_view_control",
    description: "Pan, zoom, rotate, or reset the map camera.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pan", "zoom_in", "zoom_out", "set_zoom", "rotate", "reset"] },
        dx: { type: "number" },
        dy: { type: "number" },
        delta: { type: "number" },
        zoom: { type: "number" },
        rotation: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "map_layer_control",
    description: "Select a heatmap layer and toggle human, bot, path, or event visibility.",
    parameters: {
      type: "object",
      properties: {
        layer: { type: "string", enum: ["traffic", "kills", "deaths", "storm", "loot", "off"] },
        toggles: {
          type: "object",
          properties: {
            humans: { type: "boolean" },
            bots: { type: "boolean" },
            paths: { type: "boolean" },
            events: { type: "boolean" },
          },
        },
      },
    },
  },
  {
    name: "screenshot",
    description: "Capture the current map viewport as a PNG data URL for visual inspection.",
    parameters: {
      type: "object",
      properties: {
        includeOverlay: { type: "boolean" },
      },
    },
  },
  {
    name: "event_query",
    description: "Return structured events filtered by event type, actor type, player, and time window.",
    parameters: {
      type: "object",
      properties: {
        eventType: { type: "string" },
        actorType: { type: "string", enum: ["human", "bot"] },
        userId: { type: "string" },
        fromSec: { type: "number" },
        toSec: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "path_query",
    description: "Summarize a selected/player path: point count, distance, duration, idle estimate, and event counts.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
    },
  },
  {
    name: "compare_layer_stats",
    description: "Estimate how much a selected/player path overlaps a heatmap layer.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string" },
        layer: { type: "string", enum: ["traffic", "kills", "deaths", "storm", "loot"] },
        radiusPx: { type: "number" },
      },
    },
  },
  {
    name: "match_summary",
    description: "Return compact stats for the selected match or a requested match key/id.",
    parameters: {
      type: "object",
      properties: {
        matchKey: { type: "string" },
        matchId: { type: "string" },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are LILA's tactical map analyst. Help the user inspect match data, player paths, events, heatmaps, playback, and map state.
Use the attached current map screenshot to reason visually about terrain and landmarks such as buildings, roads, rivers, plains, bridges, compounds, and chokepoints. Treat visual map inferences as observations from the image, and combine them with tool data when useful.
Before answering or acting on the current selected user/player, call get_state and use selectedPlayerId and selectedParticipant from its result. Do not guess the selected user id from chat history.
Use the available tools whenever the answer depends on current app state or match data. Be concise, specific, and mention visible state changes you made.
If a tool fails because no match is loaded, ask the user to load or select a match.`;

const SUGGESTION_PROMPTS = [
  "Summarize the selected player's route and key events.",
  "Where did this player spend the most time?",
  "Show me the next death or danger event on the timeline.",
  "Compare this route against the kills heatmap.",
  "What happened near the current selected player?",
  "Find the first loot cluster for this player.",
  "Switch to the deaths layer and explain the hotspots.",
  "Is this route more exposed or safe based on the map?",
  "Jump to the most important combat moment.",
  "What terrain or landmarks shape this route?",
  "Give me a level-design read on this match.",
  "Find unusual movement or idle behavior.",
  "Show only human routes and summarize the pattern.",
  "Show only bot routes and summarize the pattern.",
  "What should I inspect next in this match?",
];

export function AIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [isThinking, setIsThinking] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [suggestions] = useState(() => shufflePrompts(SUGGESTION_PROMPTS).slice(0, 3));
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handler = (e: CustomEvent<{ dataUrl: string }>) => {
      const match = e.detail.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        // @ts-expect-error global
        window.pendingMapImage = {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        };
        setInputValue("What is happening in this area?");
        window.dispatchEvent(new CustomEvent("OPEN_AI_TAB"));
      }
    };
    window.addEventListener("ASK_AGENT_AREA", handler as EventListener);
    return () => window.removeEventListener("ASK_AGENT_AREA", handler as EventListener);
  }, []);

  useLayoutEffect(() => {
    const anchorId = activeTurnId ?? focusMessageId;
    if (!anchorId) return;
    const container = messagesRef.current;
    const message = messageRefs.current[anchorId];
    if (!container || !message) return;

    const scrollToMessage = () => {
      container.scrollTo({
        top: Math.max(0, message.offsetTop - container.offsetTop),
        behavior: "smooth",
      });
    };

    scrollToMessage();
    const frame = window.requestAnimationFrame(scrollToMessage);
    const timeout = window.setTimeout(() => {
      scrollToMessage();
      if (!activeTurnId) setFocusMessageId(null);
    }, 700);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [activeTurnId, focusMessageId, isThinking, messages.length]);

  const handleInputFocus = () => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
    }
  };

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem("gemini_api_key", tempKey.trim());
      setApiKey(tempKey.trim());
      setTempKey("");
      setIsApiKeyModalOpen(false);
    }
  };

  const submitPrompt = async (prompt: string) => {
    if (!prompt) return;
    if (!apiKey) {
      setTempKey("");
      setIsApiKeyModalOpen(true);
      return;
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setFocusMessageId(userMessage.id);
    setActiveTurnId(userMessage.id);
    setInputValue("");
    setIsThinking(true);

    try {
      const response = await runGeminiConversation(apiKey, nextMessages, (toolMessage) => {
        setMessages((current) => [...current, toolMessage]);
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response }]);
    } catch (error) {
      const content = error instanceof Error ? error.message : "Gemini request failed.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content }]);
    } finally {
      setIsThinking(false);
      window.setTimeout(() => {
        setActiveTurnId(null);
        setFocusMessageId(null);
      }, 800);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPrompt(inputValue.trim());
  };

  return (
    <div className="aiChatContainer">
      <div
        className="aiChatMessages"
        ref={messagesRef}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            ref={(node) => {
              messageRefs.current[msg.id] = node;
            }}
            className={`aiMessageRow ${msg.role}`}
          >
            {msg.role === "tool" ? (
              <details className="aiToolCall">
                <summary>
                  <span className="aiToolPrefix">Tool called:</span>
                  <span className="aiToolName">{msg.toolName ?? msg.content}</span>
                </summary>
                <pre>{formatToolDetails(msg)}</pre>
              </details>
            ) : (
              <div className={`aiMessageBubble ${msg.role}`}>
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && !isThinking && (
          <div className="aiStarter">
            <div className="aiEmptyState">Ask Agent about the map...</div>
            <div className="aiSuggestionGrid" aria-label="Suggested prompts">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="aiSuggestionButton"
                  type="button"
                  onClick={() => void submitPrompt(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {isThinking && (
          <div className="aiMessageRow assistant">
            <div className="aiMessageBubble assistant">Thinking...</div>
          </div>
        )}
      </div>

      <div className="aiChatFooter">
        <form className="aiChatInputArea" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Message Agent..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={handleInputFocus}
            disabled={isThinking}
          />
          <button type="submit" disabled={!inputValue.trim() || isThinking}>Send</button>
        </form>
        <div className="aiPoweredBy">Agent is powered by Gemini</div>
      </div>

      {isApiKeyModalOpen && (
        <div className="apiKeyModalOverlay">
          <div className="apiKeyModal">
            <h3>Gemini API Key</h3>
            <p>You need a Gemini API key to use the AI Assistant. It will be saved locally.</p>
            <input 
              type="password" 
              placeholder="AIzaSy..." 
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
            />
            <div className="apiKeyModalActions">
              <button type="button" onClick={() => setIsApiKeyModalOpen(false)}>Cancel</button>
              <button type="button" className="primary" onClick={handleSaveKey}>Save Key</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function runGeminiConversation(apiKey: string, messages: ChatMessage[], onToolMessage: (message: ChatMessage) => void) {
  const contents = toGeminiContents(messages);
  const latestUserContent = [...contents].reverse().find((content) => content.role === "user");
  const latestPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  
  let mapImage = null;
  // @ts-expect-error global
  if (window.pendingMapImage) {
    // @ts-expect-error global
    mapImage = window.pendingMapImage;
    // @ts-expect-error global
    window.pendingMapImage = null;
  } else if (shouldAttachMapImage(latestPrompt)) {
    mapImage = await captureCurrentMapImage();
  }

  if (latestUserContent && mapImage) {
    latestUserContent.parts.push(
      mapImage,
      { text: "Current map screenshot attached. Use it for visual terrain and landmark inference when relevant." },
    );
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await requestGemini(apiKey, contents);
    const modelContent = response.candidates?.[0]?.content;
    const parts = modelContent?.parts ?? [];
    const functionCalls = parts.filter(isFunctionCallPart);

    if (!functionCalls.length) {
      const text = parts.map((part) => ("text" in part ? part.text : "")).join("").trim();
      return text || "I did not get a text response from Gemini.";
    }

    contents.push({ role: "model", parts: functionCalls });

    const functionResponses: GeminiPart[] = [];
    for (const part of functionCalls) {
      const name = part.functionCall.name as AiToolName;
      const args = part.functionCall.args ?? {};
      const result = await executeLilaTool(name, args);
      onToolMessage({
        id: crypto.randomUUID(),
        role: "tool",
        content: toolDisplayName(name),
        toolName: name,
        toolArgs: args,
        toolResult: result,
      });
      functionResponses.push({
        functionResponse: {
          name,
          response: { result },
        },
      });
    }

    contents.push({ role: "user", parts: functionResponses });
  }

  return "I used several tools but hit the tool-call limit before Gemini produced a final answer.";
}

async function requestGemini(apiKey: string, contents: GeminiContent[]): Promise<GeminiResponse> {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: {
        temperature: 0.3,
      },
    }),
  });
  const payload = await response.json() as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini request failed with status ${response.status}.`);
  }
  return payload;
}

async function executeLilaTool(name: AiToolName, args: Record<string, unknown>) {
  if (!window.lilaTools) {
    return { ok: false, tool: name, error: "LILA tools are not ready yet." };
  }
  return window.lilaTools.callTool(name, args);
}

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-12)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

function isFunctionCallPart(part: GeminiPart): part is { functionCall: { name: string; args?: Record<string, unknown> } } {
  return "functionCall" in part;
}

async function captureCurrentMapImage(): Promise<GeminiPart | null> {
  if (!window.lilaTools) return null;
  const result = await window.lilaTools.callTool("screenshot", { includeOverlay: true });
  if (!result.ok || !result.data || typeof result.data !== "object") return null;

  const dataUrl = (result.data as { dataUrl?: unknown }).dataUrl;
  if (typeof dataUrl !== "string") return null;

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
}

function shouldAttachMapImage(prompt: string) {
  return /\b(see|look|visual|image|screenshot|map|terrain|landmark|building|buildings|road|roads|river|rivers|bridge|bridges|plain|plains|field|fields|forest|water|compound|choke|chokepoint|nearby|around|route|path)\b/i.test(prompt);
}

function toolDisplayName(name: string) {
  const labels: Record<string, string> = {
    match_control: "Adjusted match selection",
    get_state: "Checked current selection",
    user_control: "Adjusted player route",
    playback_control: "Updated playback",
    timeline_control: "Moved timeline",
    map_view_control: "Adjusted map view",
    map_layer_control: "Updated map layers",
    screenshot: "Captured map view",
    event_query: "Checked match events",
    path_query: "Analyzed player path",
    compare_layer_stats: "Compared route to layer",
    match_summary: "Checked match summary",
  };
  return labels[name] ?? "Used map tool";
}

function formatToolDetails(message: ChatMessage) {
  return JSON.stringify({
    tool: message.toolName,
    args: message.toolArgs ?? {},
    result: message.toolResult,
  }, null, 2);
}

function shufflePrompts(prompts: string[]) {
  return [...prompts].sort(() => Math.random() - 0.5);
}
