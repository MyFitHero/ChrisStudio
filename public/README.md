# Interface web

Une seule page, sans framework :

- `index.html` : vues **Studio** (produire, vidéos, chaînes) et **Calendrier** (consultation seule).
- `app.js` : logique (API REST + Socket.IO pour la progression et l'envoi YouTube).
- `styles.css` : thème clair/sombre automatique, une couleur d'accent par chaîne.
- `calendar.html` : redirige vers `/#calendrier` (ancienne adresse).

API utilisées : `/api/channels`, `/api/history`, `/api/generate`, `/api/topics/:channel`,
`/api/videos/:projectId/metadata`, `/api/prepublish/validate`, `/api/youtube/channels`,
`/api/youtube/connect`, `/api/youtube/publish`.
