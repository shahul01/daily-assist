# DailyAssist: Tech Stack Architecture
## Optimized for Technical Execution Score (40% of Hackathon)

---

## Judging Criteria Breakdown (40 Points Total)

**Technical Execution = 40% of Total Score**

Breaking this down:
- **Quality Application Development** (~15 points): Clean code, good architecture, works reliably
- **Leverages Gemini 3 Effectively** (~15 points): Uses thinking levels, thought signatures, multimodal, 1M context
- **Code Quality & Functionality** (~10 points): TypeScript, tests, documentation, deployable

**Strategy**: Start simple (SvelteKit + Gemini 3) to get 30/40 points in Week 2. Add complexity strategically to reach 38-40/40 by Week 6.

---

## Phase 1: MVP Architecture (Week 1-2) - "Get to 30/40 Points"

### Goal
Functional 5-agent demo showcasing Gemini 3's core features

```
┌──────────────────────────────────────────────────────────┐
│                  USER INTERFACE                          │
│                (SvelteKit Frontend)                       │
│                                                           │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │
│  │ Read   │  │ Write  │  │ Find   │  │ Remember│  ← Agent UI Components
│  │ Agent  │  │ Agent  │  │ Agent  │  │ Agent   │        │
│  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘        │
│      │           │           │            │             │
│      └───────────┴───────────┴────────────┘             │
│                  │                                       │
│          ┌───────▼──────────┐                           │
│          │ Orchestrator     │  ← Multi-agent coordinator│
│          │ (Thought Sigs)   │                           │
│          └───────┬──────────┘                           │
└──────────────────┼──────────────────────────────────────┘
                   │
            ┌──────▼──────┐
            │   Gemini 3   │
            │     API      │
            ├──────────────┤
            │ Flash (LOW)  │ ← Read, Say agents
            │ Pro (MEDIUM) │ ← Find, Remember
            │ Pro (HIGH)   │ ← Write agent
            └──────────────┘
                   
Storage: localStorage (browser)
Deployment: Vercel (free tier)
```

### Minimum Viable Tech Stack

| Layer | Technology | Why | Setup Time |
|-------|-----------|-----|------------|
| **Framework** | SvelteKit | Full-stack in one, TypeScript built-in, fast dev | 5 min |
| **AI Engine** | Gemini 3 API | Required by hackathon, Flash + Pro models | 10 min |
| **Storage** | localStorage | Zero setup, works offline, good enough for demo | 0 min |
| **Deployment** | Vercel | Free, auto-deploys from GitHub, edge functions | 15 min |

**Total Setup**: 30 minutes  
**Score Potential**: 30/40 points (functional, uses Gemini 3, but basic)

---

## Gemini 3 Integration (Critical for 15/40 Points)

### Must-Have Features (Judges Will Check)

#### 1. Thinking Levels (REQUIRED)
```typescript
// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export async function callGemini({
  prompt,
  model = 'gemini-3-flash',
  thinkingLevel = 'low' as 'low' | 'medium' | 'high',
  systemPrompt = '',
}: {
  prompt: string;
  model?: 'gemini-3-flash' | 'gemini-3-pro';
  thinkingLevel?: 'low' | 'medium' | 'high';
  systemPrompt?: string;
}) {
  const geminiModel = genAI.getGenerativeModel({ 
    model,
    generationConfig: {
      thinking_level: thinkingLevel,  // KEY FEATURE - judges look for this
      temperature: 1.0,  // Gemini 3 default (don't change)
    }
  });

  const result = await geminiModel.generateContent(prompt);
  return {
    text: result.response.text(),
    thoughtSignature: result.response.candidates[0].content.parts[0].thoughtSignature
  };
}
```

**Why This Matters**:
- ✅ Shows you understand Gemini 3's key differentiat​or (thinking)
- ✅ Demonstrates strategic use: LOW for speed, HIGH for quality
- ✅ Judges will search your code for "thinking_level" - this is proof you used it

#### 2. Thought Signatures (REQUIRED for Function Calling)
```typescript
// src/lib/orchestrator.ts
export class AgentOrchestrator {
  private conversationHistory: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string; thoughtSignature?: string }>;
  }> = [];

  async coordinateAgents(userInput: string) {
    // Add user message
    this.conversationHistory.push({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Call Gemini with full history (includes thought signatures)
    const geminiModel = genAI.getGenerativeModel({ 
      model: 'gemini-3-pro',
      generationConfig: { thinking_level: 'medium' }
    });

    const chat = geminiModel.startChat({
      history: this.conversationHistory,  // Automatically includes thought signatures
    });

    const result = await chat.sendMessage(userInput);
    
    // Store response with thought signature for next turn
    this.conversationHistory.push({
      role: 'model',
      parts: [{
        text: result.response.text(),
        thoughtSignature: result.response.candidates[0].content.parts[0].thoughtSignature
      }]
    });

    return result.response.text();
  }
}
```

**Why This Matters**:
- ✅ Thought signatures maintain reasoning across multi-turn interactions
- ✅ **REQUIRED** for function calling (400 error if missing)
- ✅ Shows you built a "Marathon Agent" (hackathon track #1)

#### 3. Multimodal Processing (High-Value Feature)
```typescript
// src/lib/agents/readAgent.ts
export async function readImage(imageData: string): Promise<string> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-3-flash',
    generationConfig: { thinking_level: 'low' }  // Fast for accessibility
  });

  const result = await model.generateContent([
    { 
      text: 'Describe this image in detail for a blind person. Include all text, objects, colors, and spatial relationships.' 
    },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageData.split(',')[1],  // Remove data:image/jpeg;base64, prefix
      },
    },
  ]);

  return result.response.text();
}
```

**Why This Matters**:
- ✅ Accessibility projects NEED vision processing (reading images, OCR)
- ✅ Shows advanced Gemini 3 usage beyond text
- ✅ Judges impressed by multimodal demos

#### 4. 1M Token Context (Showcase Feature)
```typescript
// src/lib/agents/rememberAgent.ts
export async function analyzeUserPatterns(userId: string): Promise<string> {
  // Load user's last 3 months of interactions (~500K tokens)
  const userHistory = await loadUserHistory(userId);
  
  const prompt = `
    User History (last 3 months):
    ${userHistory}
    
    Analyze patterns:
    1. What tasks does user do most?
    2. What times of day are they most active?
    3. What problems do they struggle with?
    4. What reminders would help them?
  `;

  const result = await callGemini({
    prompt,
    model: 'gemini-3-pro',
    thinkingLevel: 'high',  // Deep reasoning over large context
  });

  return result.text;
}
```

**Why This Matters**:
- ✅ Gemini 3's 1M context is a MAJOR selling point
- ✅ Shows you can process entire patient histories, codebase contexts, etc.
- ✅ Judges look for "does this use 1M context or just send short prompts?"

---

## Project Structure (SvelteKit Best Practices)

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

---

## Installation & Setup (30 Minutes)

### Step 1: Create SvelteKit Project (5 min)
```bash
npm create svelte@latest dailyassist
cd dailyassist

# Select options:
# ┌ Welcome to SvelteKit!
# │
# ◆ Which Svelte app template?
# │ ● SvelteKit demo app
# │
# ◆ Add type checking with TypeScript?
# │ ● Yes, using TypeScript syntax
# │
# ◆ Select additional options
# │ ◼ Add ESLint for code linting
# │ ◼ Add Prettier for code formatting
# │ ◼ Try the Svelte 5 preview

npm install
```

### Step 2: Install Dependencies (5 min)
```bash
# Gemini 3 SDK
npm install @google/generative-ai

# TypeScript types
npm install -D @types/node

# Optional but recommended
npm install ai  # Vercel AI SDK (streaming helpers)
```

### Step 3: Environment Variables (5 min)
```bash
# .env.local (git ignored)
VITE_GEMINI_API_KEY=your_key_here

# .env.example (committed to git)
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**Get Gemini API Key**:
1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy key to `.env.local`

### Step 4: Configure Vercel Adapter (5 min)
```bash
npm install -D @sveltejs/adapter-vercel
```

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';

export default {
  kit: {
    adapter: adapter({
      runtime: 'nodejs20.x',  // or 'edge' for edge functions
      regions: ['iad1'],  // US East (or 'all' for edge)
    })
  }
};
```

### Step 5: Deploy to Vercel (10 min)
```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Push to GitHub
gh repo create dailyassist --public --source=. --remote=origin
git push -u origin main

# Deploy to Vercel
npm install -g vercel
vercel login
vercel  # Follow prompts

# Add environment variable on Vercel
vercel env add VITE_GEMINI_API_KEY
```

**Done!** Your app is live at `https://dailyassist-xyz.vercel.app`

---

## Technology Priorities (3 Tiers)

### 🔴 TIER 1: Must-Have (Week 1-2) - Gets You to 30/40 Points

| Technology | Why | Setup | Score Impact |
|-----------|-----|-------|--------------|
| **SvelteKit** | Full-stack framework, fast dev, TypeScript | 5 min | +10 (quality app) |
| **Gemini 3 Flash** | Fast, cheap, good for simple agents | 5 min | +5 (uses Gemini) |
| **Gemini 3 Pro** | Smart, deep reasoning for complex agents | 5 min | +5 (uses Gemini well) |
| **Thinking Levels** | LOW/MEDIUM/HIGH - shows you understand Gemini 3 | 0 min | +5 (proper usage) |
| **Thought Signatures** | Maintains context across multi-agent coordination | 10 min | +5 (advanced usage) |
| **TypeScript** | Code quality, prevents bugs, professional | 0 min | +3 (code quality) |
| **Vercel Deployment** | Live link for judges, shows it works | 15 min | +2 (functional) |

**Total Tier 1 Setup Time**: 40 minutes  
**Total Tier 1 Score**: 30/40 points (75%)

**When to do**: Week 1-2  
**Risk**: None (all essential)

---

### 🟡 TIER 2: Should-Have (Week 3-4) - Gets You to 36/40 Points

| Technology | Why | Setup | Score Impact |
|-----------|-----|-------|--------------|
| **Web Speech API** | Voice input/output for accessibility (motor disabilities) | 30 min | +2 (multimodal demo) |
| **Supabase** | Real database (replaces localStorage), shows production-ready | 60 min | +2 (quality) |
| **File Upload** | Image processing, PDF reading (visual disabilities) | 30 min | +1 (multimodal) |
| **Function Calling** | Tool use - shows advanced Gemini 3 orchestration | 60 min | +1 (technical depth) |

**Total Tier 2 Setup Time**: 3 hours  
**Total Tier 2 Score**: +6 points (36/40 = 90%)

**When to do**: Week 3-4 (after MVP works)  
**Risk**: Medium (could break MVP if rushed)

---

### 🟢 TIER 3: Nice-to-Have (Week 5-6) - Gets You to 40/40 Points

| Technology | Why | Setup | Score Impact |
|-----------|-----|-------|--------------|
| **Vector Database** (Pinecone/Supabase pgvector) | Semantic search, better Remember agent | 90 min | +1 (technical sophistication) |
| **Streaming Responses** | Real-time UI updates, feels faster | 45 min | +1 (UX polish) |
| **Redis Cache** (Vercel KV) | Faster responses, lower API costs | 60 min | +0.5 (optimization) |
| **End-to-End Tests** (Playwright) | Shows code quality, catches bugs | 120 min | +0.5 (quality) |
| **PWA** (Progressive Web App) | Works offline, installable | 60 min | +1 (accessibility) |

**Total Tier 3 Setup Time**: 6 hours  
**Total Tier 3 Score**: +4 points (40/40 = 100%)

**When to do**: Week 5-6 (if time permits)  
**Risk**: High (diminishing returns, could distract from demo polish)

---

## Detailed Technology Breakdown

### Tier 2 Deep Dive

#### 1. Web Speech API (Voice Input/Output)

**Why**: Motor disabilities can't type - voice is essential for accessibility

```typescript
// src/lib/utils/speech.ts
export const speech = {
  speak(text: string, rate: number = 0.9) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;  // Slower for accessibility
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    speechSynthesis.speak(utterance);
  },

  async listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };
      
      recognition.onerror = (event) => {
        reject(new Error(event.error));
      };
      
      recognition.start();
    });
  },

  stopSpeaking() {
    speechSynthesis.cancel();
  }
};
```

**Demo Use**:
```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { speech } from '$lib/utils/speech';
  
  async function handleVoiceInput() {
    const userSpeech = await speech.listen();
    const response = await fetch('/api/gemini/orchestrate', {
      method: 'POST',
      body: JSON.stringify({ input: userSpeech })
    });
    const data = await response.json();
    speech.speak(data.response);
  }
</script>

<button on:click={handleVoiceInput}>
  🎤 Speak to DailyAssist
</button>
```

**Score Impact**: +2 points (judges see voice demo in video)

---

#### 2. Supabase (Real Database)

**Why**: localStorage looks like a toy, Supabase looks production-ready

**Setup** (60 min):
```bash
npm install @supabase/supabase-js
```

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Example: Save medication reminder
export async function saveMedicationReminder(userId: string, medication: {
  name: string;
  dosage: string;
  time: string;
  frequency: string;
}) {
  const { data, error } = await supabase
    .from('medication_reminders')
    .insert({
      user_id: userId,
      medication_name: medication.name,
      dosage: medication.dosage,
      reminder_time: medication.time,
      frequency: medication.frequency,
    });

  if (error) throw error;
  return data;
}
```

**Database Schema**:
```sql
-- Supabase SQL Editor
CREATE TABLE medication_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  reminder_time TIME NOT NULL,
  frequency TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,  -- 'read', 'write', 'find', etc.
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  thought_signature TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_interactions_user ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_date ON user_interactions(created_at DESC);
```

**Score Impact**: +2 points (shows production-readiness)

---

#### 3. File Upload (Multimodal Input)

**Why**: Blind users need to upload images, dyslexic users need to upload PDFs

```svelte
<!-- src/lib/components/ImageUploader.svelte -->
<script lang="ts">
  import { readImage } from '$lib/agents/readAgent';

  let imagePreview = '';
  let imageDescription = '';

  async function handleImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Process with Gemini
    const base64 = await fileToBase64(file);
    imageDescription = await readImage(base64);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
</script>

<div class="image-uploader">
  <input 
    type="file" 
    accept="image/*" 
    on:change={handleImageUpload}
  />
  
  {#if imagePreview}
    <img src={imagePreview} alt="Uploaded" />
    <p>{imageDescription}</p>
  {/if}
</div>
```

**Score Impact**: +1 point (shows multimodal capability)

---

#### 4. Function Calling (Tool Use)

**Why**: Shows advanced Gemini 3 orchestration, judges love seeing agents use tools

```typescript
// src/lib/agents/functionCallingAgent.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const tools = [
  {
    name: 'search_medications',
    description: 'Search for medication information including side effects and interactions',
    parameters: {
      type: 'object',
      properties: {
        medication_name: {
          type: 'string',
          description: 'Name of the medication'
        }
      },
      required: ['medication_name']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder for the user',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What to remind' },
        time: { type: 'string', description: 'When to remind (ISO format)' }
      },
      required: ['task', 'time']
    }
  }
];

export async function orchestrateWithTools(userInput: string) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-pro',
    tools: [{ functionDeclarations: tools }],
    generationConfig: { thinking_level: 'medium' }
  });

  const chat = model.startChat();
  const result = await chat.sendMessage(userInput);

  // Check if model wants to call a function
  const functionCall = result.response.functionCall();
  if (functionCall) {
    // Execute the function
    const functionResponse = await executeFunctionCall(functionCall);
    
    // Send function result back to model (with thought signature!)
    const finalResult = await chat.sendMessage([{
      functionResponse: {
        name: functionCall.name,
        response: functionResponse
      }
    }]);
    
    return finalResult.response.text();
  }

  return result.response.text();
}

async function executeFunctionCall(call: any) {
  if (call.name === 'search_medications') {
    // Call actual medication API
    return { info: '...' };
  } else if (call.name === 'set_reminder') {
    // Save to database
    return { success: true };
  }
}
```

**Score Impact**: +1 point (demonstrates technical sophistication)

---

### Tier 3 Deep Dive (Only If Ahead of Schedule)

#### 1. Vector Database (Semantic Search)

**Why**: Remember agent becomes much better with semantic memory

**Option A: Supabase pgvector** (Easier, integrated with existing DB)
```bash
npm install @supabase/supabase-js
```

```sql
-- Enable pgvector extension in Supabase
CREATE EXTENSION vector;

CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  memory_text TEXT NOT NULL,
  embedding VECTOR(768),  -- Gemini embedding dimension
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON user_memories USING ivfflat (embedding vector_cosine_ops);
```

```typescript
// src/lib/agents/rememberAgent.ts
import { supabase } from '$lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export async function rememberWithVectorSearch(userId: string, query: string) {
  // 1. Get query embedding
  const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const queryEmbedding = await embeddingModel.embedContent(query);

  // 2. Search similar memories
  const { data: memories } = await supabase.rpc('match_memories', {
    query_embedding: queryEmbedding.embedding,
    match_threshold: 0.8,
    match_count: 5,
    user_id: userId
  });

  // 3. Use memories as context for Gemini
  const context = memories.map(m => m.memory_text).join('\n\n');
  
  const result = await callGemini({
    prompt: `Context from user's past:\n${context}\n\nUser query: ${query}`,
    model: 'gemini-3-pro',
    thinkingLevel: 'medium'
  });

  return result.text;
}
```

**Score Impact**: +1 point (shows advanced AI/database integration)

---

#### 2. Streaming Responses (Real-Time UX)

**Why**: Feels faster, more responsive

```typescript
// src/routes/api/gemini/stream/+server.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST({ request }) {
  const { prompt } = await request.json();
  
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-3-pro',
    generationConfig: { thinking_level: 'medium' }
  });

  const result = await model.generateContentStream(prompt);

  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`));
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  let response = '';

  async function streamResponse() {
    const eventSource = new EventSource('/api/gemini/stream');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      response += data.text;
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  }
</script>

<div class="response">{response}</div>
```

**Score Impact**: +1 point (polish, better UX)

---

## Architecture Decision Records (Why These Choices)

### Why SvelteKit Over Next.js/Remix?

**Advantages**:
- ✅ **Simpler**: Less boilerplate, faster to learn
- ✅ **Smaller bundles**: Svelte compiles to vanilla JS (no virtual DOM)
- ✅ **Built-in adapters**: Deploy anywhere (Vercel, Netlify, Cloudflare)
- ✅ **TypeScript default**: No setup needed
- ✅ **File-based routing**: API routes + pages in one structure

**Disadvantages**:
- ❌ Smaller ecosystem than React
- ❌ Fewer jobs (but this is a hackathon, not a job)

**Verdict**: SvelteKit wins for hackathons (speed > ecosystem)

---

### Why Vercel Over Netlify/Railway/Fly?

**Advantages**:
- ✅ **Zero config**: `vercel` command deploys instantly
- ✅ **Preview deployments**: Every PR gets a URL
- ✅ **Edge functions**: Low latency globally
- ✅ **Free tier**: Generous (100GB bandwidth, 100 serverless hours)
- ✅ **SvelteKit adapter**: Official support

**Disadvantages**:
- ❌ No database hosting (but Supabase is free anyway)

**Verdict**: Vercel is best for SvelteKit hackathons

---

### Why Supabase Over Firebase/PlanetScale?

**Advantages**:
- ✅ **Postgres**: Real SQL, vector search, full-text search
- ✅ **Free tier**: 500MB database, 2GB file storage
- ✅ **Auth built-in**: If we add user accounts later
- ✅ **Real-time subscriptions**: Database changes push to clients
- ✅ **pgvector**: Vector embeddings for semantic search

**Disadvantages**:
- ❌ Smaller than Firebase

**Verdict**: Supabase better for accessibility app (needs vector search for Remember agent)

---

## Deployment Checklist

### Pre-Deployment (Week 6)

- [ ] **Environment variables set on Vercel**
  - VITE_GEMINI_API_KEY
  - VITE_SUPABASE_URL (if using Supabase)
  - VITE_SUPABASE_ANON_KEY

- [ ] **Build succeeds locally**
  ```bash
  npm run build
  npm run preview  # Test production build
  ```

- [ ] **TypeScript has no errors**
  ```bash
  npm run check
  ```

- [ ] **All agents work in demo**
  - Read-To-Me: Reads text aloud
  - Write-For-Me: Generates emails/text
  - Find-It: Searches and navigates
  - Remember-For-Me: Sets reminders, recalls info
  - Say-It-For-Me: Speaks text aloud

- [ ] **Multi-agent orchestration works**
  - Test: "Check email" → Find-It opens Gmail → Read-To-Me reads emails → Remember-For-Me creates reminder
  - Verify thought signatures preserved across agents

- [ ] **Performance acceptable**
  - First response: <3 seconds
  - Subsequent responses: <1 second (with caching)

- [ ] **Mobile responsive**
  - Test on phone (accessibility users often on mobile)

- [ ] **Accessibility tested**
  - Voice input works
  - Voice output works
  - Keyboard navigation works
  - Screen reader compatible (WCAG AA)

---

## Scoring Optimization Strategy

### How to Guarantee 38-40/40 Technical Execution Points

**Week 1-2 (MVP)**: 30 points
- ✅ SvelteKit + TypeScript (professional)
- ✅ 5 agents working
- ✅ Gemini 3 Flash + Pro (2 models)
- ✅ Thinking levels (LOW, MEDIUM, HIGH)
- ✅ Thought signatures (multi-turn context)
- ✅ Deployed to Vercel (live link)

**Week 3-4 (Enhanced)**: +6 points
- ✅ Voice input/output (Web Speech API)
- ✅ Supabase database (production-ready)
- ✅ Image upload + processing (multimodal)
- ✅ Function calling (tool use)

**Week 5-6 (Polish)**: +2-4 points
- ✅ Streaming responses (better UX)
- ✅ Vector search (advanced feature)
- ⚠️ Only if time permits!

**Total**: 38-40 points (95-100%)

---

## Code Quality Checklist (10 Points)

- [ ] **TypeScript everywhere** (no `any` types)
- [ ] **ESLint passes** (no warnings)
- [ ] **Prettier formatted** (consistent style)
- [ ] **Functions documented** (JSDoc comments)
- [ ] **Error handling** (try/catch, user-friendly errors)
- [ ] **Loading states** (spinners while agents think)
- [ ] **README.md** (setup instructions, architecture diagram)
- [ ] **Environment variables documented** (.env.example)
- [ ] **Git commits meaningful** ("Add Read agent" not "fix stuff")
- [ ] **No hardcoded API keys** (use env vars)

---

## Final Architecture Diagram (Week 6)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                           │
│                 (SvelteKit + TypeScript)                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Voice   │  │  Camera  │  │  Text    │  │  Touch   │   │
│  │  Input   │  │  Input   │  │  Input   │  │  Input   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                     │                                       │
│            ┌────────▼──────────┐                           │
│            │  Agent UI Layer   │                           │
│            │  (5 Components)   │                           │
│            └────────┬──────────┘                           │
│                     │                                       │
│            ┌────────▼──────────┐                           │
│            │  Orchestrator     │                           │
│            │ (Thought Sigs +   │                           │
│            │  Function Calls)  │                           │
│            └────────┬──────────┘                           │
└─────────────────────┼──────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼────┐  ┌───▼────┐  ┌───▼────┐
    │ Gemini  │  │ Supa-  │  │ Web    │
    │ 3 API   │  │ base   │  │ Speech │
    │         │  │ (Postgr│  │ API    │
    │ Flash:  │  │ + Vec) │  │        │
    │ • Read  │  │        │  │ Input: │
    │ • Say   │  │ Tables:│  │ Voice→ │
    │         │  │ • users│  │  Text  │
    │ Pro:    │  │ • meds │  │        │
    │ • Write │  │ • inter│  │ Output:│
    │ • Find  │  │ • memor│  │ Text→  │
    │ • Rememb│  │        │  │ Voice  │
    └─────────┘  └────────┘  └────────┘

Deployment: Vercel Edge Functions (Global CDN)
Monitoring: Vercel Analytics + Error Tracking
```

---

## Next Steps

1. **Week 1-2**: Follow MVP setup (30 min), build 5 agents (30 hours)
2. **Week 3-4**: Add voice + Supabase (10 hours)
3. **Week 5-6**: Polish + demo video (20 hours)

**Total Time**: 60 hours (10 hours/week × 6 weeks)

**Score**: 38-40/40 points (95-100% on Technical Execution)

**Result**: You WILL win.
