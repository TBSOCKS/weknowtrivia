import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SEASON_NAMES = {
  1:'Borneo',2:'Australian Outback',3:'Africa',4:'Marquesas',5:'Thailand',
  6:'Amazon',7:'Pearl Islands',8:'All-Stars',9:'Vanuatu',10:'Palau',
  11:'Guatemala',12:'Panama',13:'Cook Islands',14:'Fiji',15:'China',
  16:'Micronesia',17:'Gabon',18:'Tocantins',19:'Samoa',20:'Heroes vs. Villains',
  21:'Nicaragua',22:'Redemption Island',23:'South Pacific',24:'One World',
  25:'Philippines',26:'Caramoan',27:'Blood vs. Water',28:'Cagayan',
  29:'San Juan del Sur',30:'Worlds Apart',31:'Cambodia',32:'Kaôh Rōng',
  33:'Millennials vs. Gen X',34:'Game Changers',35:'Heroes vs. Healers vs. Hustlers',
  36:'Ghost Island',37:'David vs. Goliath',38:'Edge of Extinction',
  39:'Island of the Idols',40:'Winners at War',41:'Season 41',42:'Season 42',
  43:'Season 43',44:'Season 44',45:'Season 45',46:'Season 46',47:'Season 47',
  48:'Season 48',49:'Season 49',50:'Season 50',
}

export async function POST(req) {
  // Use service role key — bypasses RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { rows } = await req.json()
  const errors = []
  let totalCastaways = 0

  // Get or create Survivor show
  let { data: show } = await supabase.from('shows').select('id').eq('slug', 'survivor').single()
  if (!show) {
    const { data: created } = await supabase
      .from('shows').insert({ name: 'Survivor', slug: 'survivor' }).select('id').single()
    show = created
  }
  if (!show) return NextResponse.json({ error: 'Could not find Survivor show' }, { status: 500 })

  // Group by season
  const bySeason = {}
  rows.forEach(r => {
    const s = String(r.Season ?? '').trim()
    if (!s) return
    if (!bySeason[s]) bySeason[s] = []
    bySeason[s].push(r)
  })

  const seasonNums = Object.keys(bySeason).sort((a, b) => parseInt(a) - parseInt(b))

  for (const seasonNum of seasonNums) {
    const seasonInt = parseInt(seasonNum)
    const name = SEASON_NAMES[seasonInt] ?? `Season ${seasonNum}`
    const version_season = `US${String(seasonInt).padStart(2, '0')}`

    // Upsert season
    let seasonId
    const { data: existing } = await supabase
      .from('seasons').select('id')
      .eq('show_id', show.id).eq('season_number', seasonInt).single()

    if (existing) {
      seasonId = existing.id
    } else {
      const { data: created, error } = await supabase
        .from('seasons')
        .insert({ show_id: show.id, name, season_number: seasonInt, version_season })
        .select('id').single()
      if (error) { errors.push(`Season ${seasonNum}: ${error.message}`); continue }
      seasonId = created.id
    }

    // Replace castaways
    await supabase.from('castaways').delete().eq('season_id', seasonId)

    const castawayRows = bySeason[seasonNum].map(r => {
      const rawId   = String(r.ID ?? '').trim()
      const numPart = rawId.replace(/^[A-Za-z]+/, '').padStart(4, '0')
      return {
        season_id:   seasonId,
        name:        String(r.Castaway ?? '').trim(),
        castaway_id: numPart,
        placement:   parseInt(r.Placement) || 0,
      }
    }).filter(r => r.name && r.castaway_id && r.placement > 0)

    if (castawayRows.length === 0) continue

    const { error } = await supabase.from('castaways').insert(castawayRows)
    if (error) errors.push(`Castaways S${seasonNum}: ${error.message}`)
    else totalCastaways += castawayRows.length
  }

  return NextResponse.json({
    seasons: seasonNums.length,
    castaways: totalCastaways,
    errors,
  })
}
