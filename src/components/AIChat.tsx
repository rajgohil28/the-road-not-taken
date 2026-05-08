import { useState } from "react";
import type { ChatMessage } from "../types";

export function AIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState("");

  const handleInputFocus = () => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
    }
  };

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem("gemini_api_key", tempKey.trim());
      setApiKey(tempKey.trim());
      setIsApiKeyModalOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !apiKey) return;

    const newMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: inputValue.trim() };
    setMessages((prev) => [...prev, newMsg]);
    setInputValue("");
    
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString() + "_tool", role: "tool", content: "tool_call: get_map_stats" },
        { id: Date.now().toString() + "_ast", role: "assistant", content: "I am ready to help you analyze this map using Gemini 3 Flash. Please provide the system prompt." }
      ]);
    }, 1000);
  };

  return (
    <div className="aiChatContainer">
      <div className="aiChatMessages">
        {messages.map((msg) => (
          <div key={msg.id} className={`aiMessageRow ${msg.role}`}>
            {msg.role === "tool" ? (
              <span className="aiToolText">{msg.content}</span>
            ) : (
              <div className={`aiMessageBubble ${msg.role}`}>
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="aiEmptyState">Ask Gemini about the map...</div>
        )}
      </div>

      <form className="aiChatInputArea" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Message Gemini..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleInputFocus}
        />
        <button type="submit" disabled={!inputValue.trim()}>Send</button>
      </form>

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