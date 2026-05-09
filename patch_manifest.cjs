const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('public/data/manifest.json', 'utf8'));
for (const match of manifest.matches) {
  try {
    const payload = JSON.parse(fs.readFileSync(`public/data/matches/${match.key}.json`, 'utf8'));
    const primaryParticipant = payload.participants.find(p => p.type === 'human') || payload.participants[0];
    match.primaryUserId = primaryParticipant ? primaryParticipant.userId : '';
  } catch (e) {
    console.error('Error with match', match.key, e);
  }
}
fs.writeFileSync('public/data/manifest.json', JSON.stringify(manifest));
console.log('Done patching manifest.json');
