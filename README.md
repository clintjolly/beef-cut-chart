# Butcher Boy Cut Guide

Interactive cut chart for butcherboyreno.com. Customers click on a cow, see what cuts come from each primal, and get cooking guidance and recipe ideas.

## How content flows

```
Katie/Clint edits in Airtable
        ↓ (cached 5 min at the edge)
Vercel serverless fn /api/content
        ↓
Browser renders the page
```

**Editing content:** Open the "Butcher Boy Cut Guide" Airtable base (`appPYRvXRYqEkO4jE`). Edit primals, cuts, or recipes there. Changes appear on the live site within ~5 minutes (cache TTL).

**Adding a new animal:** In Airtable, add the animal to the Animals table, upload its SVG to the SVG File attachment field, add primals/cuts/recipes linked to it, then check Active. To switch which animal the site shows by default, edit `ACTIVE_ANIMAL_SLUG` near the top of the `<script>` block in `index.html` and redeploy.

## Files

- `index.html` — front-end. Layout + cow rendering. No content baked in.
- `api/content.js` — serverless function. Reads Airtable, returns clean JSON.
- `package.json` — tells Vercel this is a Node project.

## Required environment variable

Set in Vercel project settings → Environment Variables:

- `AIRTABLE_TOKEN` — Personal Access Token, scoped to the Cut Guide base only, with `data.records:read` and `schema.bases:read` permissions only.

## Deploying changes

```bash
vercel --prod
```

Run from this folder. Vercel CLI handles the rest.
