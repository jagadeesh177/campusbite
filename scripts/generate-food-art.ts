// Generates the illustrated placeholder artwork in public/food/*.svg.
// Run: npx tsx scripts/generate-food-art.ts
// Replace with real photos via Canteen → Menu → Edit item → Upload photo.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIES, FOODS } from '../prisma/seed-data'

const outDir = join(process.cwd(), 'public', 'food')
mkdirSync(outDir, { recursive: true })

for (const food of FOODS) {
  const cat = CATEGORIES.find((c) => c.slug === food.category)!
  const [a, b] = cat.tint
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${food.name}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="plate" cx="0.5" cy="0.45" r="0.5">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.85" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f1f5f9"/>
    </radialGradient>
  </defs>
  <rect width="400" height="300" fill="url(#g)"/>
  <circle cx="340" cy="40" r="70" fill="#ffffff" opacity="0.25"/>
  <circle cx="50" cy="270" r="90" fill="#ffffff" opacity="0.2"/>
  <ellipse cx="200" cy="232" rx="118" ry="16" fill="#0f172a" opacity="0.08"/>
  <circle cx="200" cy="150" r="92" fill="url(#plate)"/>
  <circle cx="200" cy="150" r="72" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <text x="200" y="150" text-anchor="middle" dominant-baseline="central" font-size="96"
    font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${food.emoji}</text>
</svg>
`
  writeFileSync(join(outDir, `${food.slug}.svg`), svg)
}
console.log(`Wrote ${FOODS.length} illustrations to ${outDir}`)
