# CLAUDE.md — ChrisStudio

> Studio de production automatisée de vidéos YouTube style documentaire avec IA.
> Créé le 2026-04-24.

---

## C'est quoi ce projet

Pipeline complet Node.js/TypeScript qui génère des vidéos YouTube de A à Z :
1. Génère un script (Claude Opus 5.5, structure 3 actes)
2. Synthèse vocale (ElevenLabs)
3. Génère une image IA par plan (kie.ai ou fal.ai), Pexels en secours
4. Montage vidéo FFmpeg 1080p avec effets visuels
5. Upload YouTube automatisé

**3 chaînes cibles :**
- `what-if` — Scénarios hypothétiques ("Et si...")
- `human-odyssey` — Histoire et civilisations
- `classified-files` — Mystères et affaires non résolues

**Coût estimé par vidéo :** ~3–5 EUR (ElevenLabs + Claude + ~90 images fal.ai)

---

## Stack technique

- **Backend** : Node.js 18+ + Express + TypeScript (`tsx`)
- **Scripts IA** : Claude (`claude-opus-5-5`) via `@anthropic-ai/sdk`, appels centralisés dans `src/services/claude-client.ts`
- **Voix** : ElevenLabs (voix différente par chaîne)
- **Visuels** : images IA fal.ai (`ai-visual-collector.ts`), Pexels en secours ou avec `VISUAL_SOURCE=pexels`
- **Montage** : FFmpeg (requis en PATH)
- **Tests** : Vitest
- **Upload** : googleapis (YouTube Data API v3)

---

## Clés API nécessaires (`.env`)

```env
ANTHROPIC_API_KEY=     # Claude — sujets, scripts, métadonnées, prompts d'images
KIE_API_KEY=           # kie.ai — génération d'images (ou FAL_KEY pour fal.ai)
PEXELS_API_KEY=        # B-roll gratuit
ELEVENLABS_API_KEY=    # Synthèse vocale
PORT=3000
NODE_ENV=development
```

Voir `.env.example` pour la liste complète.

---

## Lancer le projet

```bash
npm install
npm run server:dev     # Serveur Express + interface web http://localhost:3000
npm run generate:full what-if "Et si l'IA devenait consciente?"  # Pipeline CLI complet
npm test               # Vitest
```

---

## Architecture `src/`

```
src/
├── config/channels.ts              # Config des 3 chaînes (voix, style, prompts)
├── config/youtube-channels.ts      # Chaîne ChrisStudio -> ID YouTube (UC...), handle, catégorie
├── services/
│   ├── claude-client.ts            # Client Claude partagé
│   ├── script-generator.ts         # Claude, structure 3 actes
│   ├── ai-visual-collector.ts      # Images IA par plan (+ fallback Pexels)
│   ├── image-prompt-writer.ts      # Narration -> prompts d'images
│   ├── kie-image-generator.ts      # API kie.ai (createTask + polling)
│   ├── fal-image-generator.ts      # API fal.ai
│   ├── elevenlabs-voice-generator.ts
│   ├── asset-collector.ts          # Pexels API
│   ├── video-composer.ts           # FFmpeg
│   ├── visual-effects-engine.ts    # 8+ effets visuels
│   ├── dynamic-pacing-engine.ts    # Pacing adaptatif 2–12s/plan
│   ├── youtube-uploader.ts         # YouTube Data API (1 login par chaîne, stats)
│   ├── video-scheduler.ts          # Planification des uploads
│   └── ...
├── workflows/full-video-pipeline.ts  # Pipeline complet
├── server.ts                         # Express + Socket.io
└── cli.ts                            # Entrée CLI
```

---

## État du projet (2026-04-24)

| Fonctionnalité | Statut |
|---|---|
| Génération script Claude | OK |
| Images IA par plan (fal.ai) | OK |
| Voix ElevenLabs | OK |
| B-roll Pexels | OK |
| Montage FFmpeg | OK |
| Upload YouTube | OK |
| Interface web | OK |
| Scheduler | OK |
| Musique de fond | En attente d'assets |
| SFX | En attente d'assets |

---

## Règles pour ce projet

- Ne jamais committer les clés API (`.env` est dans `.gitignore`)
- Valider avec Christophe avant tout changement dans `src/config/channels.ts` (config des chaînes = cœur du projet)
- FFmpeg doit être installé et dans le PATH pour que les tests vidéo fonctionnent
- Les outputs (`output/`, `data/`) ne sont pas versionnés
