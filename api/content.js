// Serverless function: GET /api/content
// Fetches active animals + their primals + cuts + recipes from Airtable,
// returns a single JSON tree the front-end can render directly.
//
// Cached at the edge for 5 minutes — meaning Katie's edits in Airtable
// will appear on the live site within ~5 min of saving.

const BASE_ID = 'appPYRvXRYqEkO4jE';
const TOKEN = process.env.AIRTABLE_TOKEN;

const TABLES = {
  animals:  'tblyJuWxxibKiSse4',
  primals:  'tblOdIafaI9uYVur6',
  cuts:     'tbl1yVuQhonx4cyBS',
  recipes:  'tblovuaDv3QLUw76m',
};

async function fetchAll(tableId) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${tableId} failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  // CORS — allow your live site to fetch this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!TOKEN) {
    return res.status(500).json({
      error: 'AIRTABLE_TOKEN env variable not set in Vercel',
    });
  }

  try {
    // Fire all four table fetches in parallel
    const [animals, primals, cuts, recipes] = await Promise.all([
      fetchAll(TABLES.animals),
      fetchAll(TABLES.primals),
      fetchAll(TABLES.cuts),
      fetchAll(TABLES.recipes),
    ]);

    // ---------- Build cut → recipes index ----------
    const recipesByCutId = {};
    for (const r of recipes) {
      const cutIds = r.fields['Cut'] || [];
      for (const cutId of cutIds) {
        (recipesByCutId[cutId] ||= []).push({
          name: r.fields['Name'] || '',
          desc: r.fields['Description'] || '',
          tag:  r.fields['Tag'] || '',
          url:  r.fields['Recipe URL'] || '',
          photo: r.fields['Photo']?.[0]?.url || null,
          order: r.fields['Display Order'] ?? 999,
        });
      }
    }
    Object.values(recipesByCutId).forEach(arr =>
      arr.sort((a, b) => a.order - b.order)
    );

    // ---------- Build primal → cuts index ----------
    const cutsByPrimalId = {};
    for (const c of cuts) {
      if (c.fields['Active'] === false) continue;
      const primalIds = c.fields['Primal'] || [];
      for (const primalId of primalIds) {
        (cutsByPrimalId[primalId] ||= []).push({
          id: c.id,
          name: c.fields['Name'] || '',
          method: c.fields['Cooking Method'] || '',
          timing: c.fields['Timing'] || '',
          bestFor: c.fields['Best For'] || '',
          desc: c.fields['Description'] || '',
          photo: c.fields['Photo']?.[0]?.url || null,
          order: c.fields['Display Order'] ?? 999,
          recipes: recipesByCutId[c.id] || [],
        });
      }
    }
    Object.values(cutsByPrimalId).forEach(arr =>
      arr.sort((a, b) => a.order - b.order)
    );

    // ---------- Build animal → primals index ----------
    const primalsByAnimalId = {};
    for (const p of primals) {
      if (p.fields['Active'] === false) continue;
      const animalIds = p.fields['Animal'] || [];
      for (const animalId of animalIds) {
        (primalsByAnimalId[animalId] ||= []).push({
          id: p.id,
          name: p.fields['Name'] || '',
          svgPathId: p.fields['SVG Path ID'] || '',
          subtitle: p.fields['Subtitle'] || '',
          description: p.fields['Description'] || '',
          order: p.fields['Display Order'] ?? 999,
          cuts: cutsByPrimalId[p.id] || [],
        });
      }
    }
    Object.values(primalsByAnimalId).forEach(arr =>
      arr.sort((a, b) => a.order - b.order)
    );

    // ---------- Build top-level animals array ----------
    const animalsOut = animals
      .filter(a => a.fields['Active'] === true)
      .map(a => ({
        id: a.id,
        name: a.fields['Name'] || '',
        slug: a.fields['Slug'] || '',
        description: a.fields['Description'] || '',
        svgUrl: a.fields['SVG File']?.[0]?.url || null,
        primals: primalsByAnimalId[a.id] || [],
      }));

    // Cache aggressively at the edge: 5 min fresh, 10 min stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ animals: animalsOut });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
