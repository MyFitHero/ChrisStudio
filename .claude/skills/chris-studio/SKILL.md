---
name: chris-studio
description: "Contexte pour ChrisStudio — pipeline de création de vidéos YouTube sur 3 chaînes (8-10 min). Stack Node.js + Claude + fal.ai + ElevenLabs + FFmpeg. Trigger: /chris-studio"
trigger: /chris-studio
---
# ChrisStudio — Skill de contexte

## Ce que c'est
Pipeline automatisé de création de vidéos YouTube sur 3 chaînes distinctes.
Vidéos de 8 à 10 minutes générées avec IA (script, voix, montage).

## Stack
- Node.js / Express (orchestration)
- Claude Opus 5.5 (génération script et contenu)
- fal.ai / Flux (une image IA par plan)
- ElevenLabs (voix synthétisée)
- FFmpeg (montage vidéo)
- Chemin local : `C:\Users\artir\Documents\ChrisStudio-main`

## Au démarrage d'une session ChrisStudio
1. Demander : "On travaille sur quelle chaîne ? (1 / 2 / 3)"
2. Demander : "Pipeline complet ou une étape spécifique ?"
3. Vérifier les coûts API estimés avant de lancer un batch

## À documenter (lacune connue — audit 2026-06-04)
- Noms et thèmes des 3 chaînes YouTube
- Coût moyen par vidéo (Claude + fal.ai + ElevenLabs)
- État du pipeline : manuel ou entièrement automatisé ?
- Fréquence de publication cible
