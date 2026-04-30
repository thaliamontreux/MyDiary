#!/usr/bin/env node

// CommonJS version of the tag icon generator so it works when package.json has "type": "module".

const path = require('path');
const fs = require('fs');

// Keep TAG_EMOJI keys in sync with src/ui.js (normalizeTagKey logic).
const TAG_EMOJI_KEYS = [
  'lgbt','lgbtq','lgbtqia+','lgbtqia','queer','pride','gay','lesbian','bisexual','pansexual','asexual','aromantic','demisexual','transgender','trans','nonbinary','enby','genderfluid','genderqueer','agender','intersex','twospirit','queercommunity','pridemonth','loveislove','bornthisway','comingout','transrights','gaypride','lesbianpride','bi','pan','ace','aro','transman','transwoman','mtf','ftm','nonbinarypride','genderidentity','sexuality','queerjoy','queerlove','rainbow','rainbowflag','prideflag','ally','lgbtally','safespace','visibilitymatters','transvisibility','bisexualvisibility','lesbianvisibility','gayvisibility','queervisibility','transisbeautiful','protecttranskids','lovehasnolabels','beproud','outandproud','pride2026','queerartist','lgbtcreator','lgbtartist','queerwriter','gaymer','wlw','mlm','sapphic','achillean','androgynous','drag','dragqueen','dragking','ballroomculture','voguing','queerfashion','genderexpression','pridevibes','queerhistory','stonewall','chosenfamily','lgbtyouth','queeryouth','transyouth','lgbtparents','queerparents','gaylove','lesbianlove','translove','queerandproud','lgbtqsupport','humanrights','equality','nohate','stopdiscrimination','inclusive','diversity','representationmatters','prideallyear',
  'lgbtqrights','equalrights','transrightsarehumanrights','queerrights','fightforlove','endiscrimination','stophomophobia','stoptransphobia','biphobia','homophobia','transphobia','queerphobia','hatecrime','antihate','bullying','cyberbullying','schoolbullying','familyrejection','comingoutstruggles','closeted','forcedouting','religioustrauma','conversiontherapy','banconversiontherapy','mentalhealthmatters','lgbtqmentalhealth','depressionawareness','anxietyawareness','suicideprevention','youthhomelessness','lgbthomeless','healthcareinequality','transhealthcare','genderaffirmingcare','insuranceissues','workplacediscrimination','housingdiscrimination','legalrights','marriageequality','adoptionrights','militaryban','policychange','activism','grassroots','protest','standup','advocacy','queeradvocacy','transadvocacy','lobbying','representationgap','mediarepresentation','visibilitygap','intersectionality','racialjustice','blackqueerlivesmatter','queerpeopleofcolor','immigrationissues','asylumseekers','globalqueerissues','safeschools','inclusiveeducation','genderneutral','pronouns','respectpronouns','misgendering','deadnaming','identityerasure','biinvisibility','aceerasure','transerasure','queererasure','censorship','bookbans','dragbans','bathroombills','legislation','protectlgbtq','allyship','beanally','speakup','silenceisviolence','supporttransyouth','protectqueerkids','lgbtqsafety','safehousing','safehealthcare','communitysupport','mutualaid','nonprofitsupport','donate','volunteer','grassrootsmovement','changeisneeded','endstigma','fightstigma','visibilitysaveslives','loveoverhate','justiceforall','equalfuture',
  'selflove','selfacceptance','loveyourself','healingjourney','innerpeace','prideinside','findingmyself','authenticself','beingme','identityjourney','growth','healing','freedom','liberation','confidence','courage','bravery','strength','resilience','hope','belonging','acceptance','validation','seen','heard','understood','connection','communitylove','supportsystem','chosenfamilylove','warmth','joyful','celebration','happiness','euphoria','gendereuphoria','relief','peaceful','safe','comfort','heartsopen','lovewins','togetherness','kindness','compassion','empathy','uplifting','encouragement','motivation','inspiration','proudmoment','livingmytruth','outandfree','fear','anxiety','stress','loneliness','isolation','rejection','heartbreak','confusion','dysphoria','genderdysphoria','overwhelmed','sadness','pain','struggle','hurt','anger','frustration','exhausted','burnout','trauma','healingfromtrauma','survivor','stillstanding','keepgoing','nevergiveup','youarenotalone','wegotthis','holdon','hopeful','lightahead','newbeginnings','selfdiscovery','growthmindset','transform','rebirth','becoming','softness','vulnerability','realfeelings','honesty','truth','expression','feelingseen','innerstrength','riseabove','ownyourstory'
];

const OUT_DIR = path.join(__dirname, '..', 'Images', 'emoji');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function slugToLabel(slug) {
  return slug.replace(/\+/g, ' plus ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickPalette(index) {
  const palettes = [
    { bg: '#111827', fg: '#f97316' },
    { bg: '#1f2933', fg: '#3b82f6' },
    { bg: '#111827', fg: '#ec4899' },
    { bg: '#111827', fg: '#a855f7' },
    { bg: '#111827', fg: '#22c55e' },
    { bg: '#111827', fg: '#eab308' },
    { bg: '#111827', fg: '#14b8a6' },
    { bg: '#111827', fg: '#f97316' }
  ];
  return palettes[index % palettes.length];
}

function generateIconSvg(key, index) {
  const { bg, fg } = pickPalette(index);
  const title = slugToLabel(key) || 'tag';
  const center = 32;
  const radius = 18 + (index % 6);
  const angle = (index * 37) % 360;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${title} icon">
  <defs>
    <linearGradient id="grad-${key}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${fg}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${fg}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="16" ry="16" fill="${bg}"/>
  <g transform="translate(${center} ${center}) rotate(${angle})">
    <circle cx="0" cy="0" r="${radius}" fill="url(#grad-${key})"/>
    <path d="M ${-radius/2} 0 L 0 ${-radius/2} L ${radius/2} 0 L 0 ${radius/2} Z" fill="${bg}" fill-opacity="0.16"/>
    <circle cx="0" cy="0" r="${radius/3}" fill="${bg}" fill-opacity="0.08"/>
  </g>
</svg>`;
}

let count = 0;

for (let i = 0; i < TAG_EMOJI_KEYS.length; i++) {
  const key = TAG_EMOJI_KEYS[i];
  const fileName = `${key}.svg`;
  const outPath = path.join(OUT_DIR, fileName);
  const svg = generateIconSvg(key, i);
  fs.writeFileSync(outPath, svg, 'utf8');
  count++;
}

console.log(`Generated ${count} tag icons in ${OUT_DIR}`);
