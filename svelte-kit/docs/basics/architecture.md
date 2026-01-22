```
dailyassist/
├── src/
│   ├── routes/
│   │   ├── +page.svelte                 # Main UI
│   │   ├── +layout.svelte               # Global layout
│   │   ├── api/
│   │   │   ├── gemini/
│   │   │   │   ├── orchestrate/+server.ts   # Multi-agent coordinator
│   │   │   │   ├── read/+server.ts          # Read-To-Me agent
│   │   │   │   ├── write/+server.ts         # Write-For-Me agent
│   │   │   │   ├── find/+server.ts          # Find-It agent
│   │   │   │   ├── remember/+server.ts      # Remember agent
│   │   │   │   └── speak/+server.ts         # Say-It agent
│   │   │   └── health/+server.ts            # Health check
│   ├── lib/
│   │   ├── components/
│   │   │   ├── AgentPanel.svelte            # Main agent UI
│   │   │   ├── ReadAgent.svelte
│   │   │   ├── WriteAgent.svelte
│   │   │   ├── FindAgent.svelte
│   │   │   ├── RememberAgent.svelte
│   │   │   └── SpeakAgent.svelte
│   │   ├── agents/
│   │   │   ├── orchestrator.ts              # Multi-agent coordinator
│   │   │   ├── readAgent.ts
│   │   │   ├── writeAgent.ts
│   │   │   ├── findAgent.ts
│   │   │   ├── rememberAgent.ts
│   │   │   └── speakAgent.ts
│   │   └── utils/
│   │       ├── gemini.ts                    # Gemini API wrapper
│   │       ├── speech.ts                    # Web Speech API
│   │       └── storage.ts                   # localStorage wrapper
│   └── app.html
├── static/
│   └── favicon.png
├── tests/
│   └── orchestrator.test.ts
├── .env.example
├── svelte.config.js
├── vite.config.ts
├── package.json
└── README.md
```