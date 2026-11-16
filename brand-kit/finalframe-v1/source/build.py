"""Rebuild original vector masters and exports; Python: fonttools cairosvg pillow pypdf.
Raster concept is an unchanged ImageGen exploration. Production assets below are
independently constructed geometric vectors, with type outlined from OFL Manrope.
"""
from pathlib import Path
from io import BytesIO
import json, shutil, zipfile
import cairosvg
from PIL import Image
from pypdf import PdfWriter, PdfReader
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT=Path(__file__).resolve().parents[1]
INK='#0B0B0C'; WHITE='#FFFFFF'; LIME='#C6F432'; GRAY='#A6A6AE'
FONT=instantiateVariableFont(TTFont(ROOT/'source/Manrope.ttf'),{'wght':700})
GLYPHS=FONT.getGlyphSet(); CMAP=FONT.getBestCmap(); UPM=FONT['head'].unitsPerEm
# Two rising frame cuts: a compact, deliberately original geometric master.
MARK='M40 228 L304 164 L304 312 L196 339 L196 398 L140 412 L140 304 L256 275 L256 228 L98 268 L98 422 L40 436 Z M186 112 L450 48 L450 196 L382 213 L382 288 L326 302 L326 176 L402 157 L402 109 L186 162 Z'
def text(txt,x,y,size,color=WHITE):
    out=[]; cursor=0
    for ch in txt:
        name=CMAP.get(ord(ch),'.notdef'); glyph=GLYPHS[name]; pen=SVGPathPen(GLYPHS); glyph.draw(pen)
        out.append(f'<path d="{pen.getCommands()}" transform="translate({cursor} 0)"/>'); cursor+=glyph.width
    return f'<g fill="{color}" transform="translate({x} {y}) scale({size/UPM} {-size/UPM})">'+''.join(out)+'</g>'
def mark(x,y,size,color=LIME):
    return f'<path d="{MARK}" fill="{color}" transform="translate({x} {y}) scale({size/512})"/>'
def rect(x,y,w,h,c,rx=0):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{c}"/>'
def svg(w,h,body): return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="FinalFrame">{body}</svg>'
def save(folder,name,w,h,body,png=True,pdf=False):
    target=ROOT/folder;target.mkdir(parents=True,exist_ok=True); data=svg(w,h,body)
    (target/(name+'.svg')).write_text(data)
    if png:cairosvg.svg2png(bytestring=data.encode(),write_to=str(target/(name+'.png')))
    if pdf:cairosvg.svg2pdf(bytestring=data.encode(),write_to=str(target/(name+'.pdf')))
    return data

# Transparent vector + raster + scalable PDF masters; no embedded font dependency.
for name,color in [('ink',INK),('white',WHITE),('lime',LIME)]:
    save('01-logos','mark-'+name,512,512,mark(0,0,512,color),pdf=True)
    save('01-logos','wordmark-'+name,1280,240,text('FinalFrame',24,172,194,color),pdf=True)
    save('01-logos','horizontal-'+name,1600,320,mark(12,16,288,color)+text('FinalFrame',345,224,194,color),pdf=True)
    save('01-logos','stacked-'+name,1100,840,mark(294,45,512,color)+text('FinalFrame',80,740,150,color),pdf=True)
save('01-logos','horizontal-primary-dark',1600,320,rect(0,0,1600,320,INK)+mark(12,16,288,LIME)+text('FinalFrame',345,224,194,WHITE),pdf=True)
save('01-logos','horizontal-primary-light',1600,320,rect(0,0,1600,320,WHITE)+mark(12,16,288,INK)+text('FinalFrame',345,224,194,INK),pdf=True)
for name,bg,fg in [('lime',LIME,INK),('dark',INK,WHITE),('white',WHITE,INK)]:
    save('02-icons','avatar-'+name,1024,1024,rect(0,0,1024,1024,bg)+mark(155,155,714,fg))
    save('02-icons','app-icon-'+name,512,512,rect(0,0,512,512,bg,106)+mark(65,65,382,fg))
icon=svg(512,512,rect(0,0,512,512,LIME,106)+mark(65,65,382,INK))
for size in [16,32,48,64,180,192,512]:
    cairosvg.svg2png(bytestring=icon.encode(),output_width=size,output_height=size,write_to=str(ROOT/f'02-icons/icon-{size}.png'))
Image.open(ROOT/'02-icons/icon-512.png').save(ROOT/'02-icons/favicon.ico',sizes=[(16,16),(32,32),(48,48)])
(ROOT/'02-icons/favicon.svg').write_text(icon)

# Original campaign compositions. SVG source can be edited in any vector editor.
def lockup(x,y,scale=1):return f'<g transform="translate({x} {y}) scale({scale})">'+mark(0,0,90,LIME)+text('FinalFrame',108,65,56)+'</g>'
def campaign(w,h,kind):
    b=rect(0,0,w,h,INK)
    if kind=='wide':
        b+=mark(w*.68,-h*.2,h*1.4,'#191C11')+lockup(w*.055,h*.12,.8)
        b+=text('Imagine it.',w*.055,h*.51,h*.15)+text('Make it a film.',w*.055,h*.72,h*.15,LIME)
        b+=text('usefinalframe.xyz',w*.055,h*.89,h*.035,GRAY)
    elif kind=='square':
        b+=lockup(70,60,1.1)+mark(610,330,480,'#202714')
        b+=text('Your next',70,390,110)+text('great story',70,525,110)+text('starts here.',70,660,110,LIME)
        b+=text('Bring an idea. Shape every scene.',75,850,32,GRAY)+text('usefinalframe.xyz',75,990,26)
    elif kind=='story':
        b+=lockup(80,220,1.1)+mark(200,500,680,LIME)
        b+=text('Imagine it.',80,1310,112)+text('Make it',80,1440,112)+text('a film.',80,1570,112,LIME)
        b+=text('usefinalframe.xyz',80,1690,30,GRAY)
    return b
save('03-social','feed-post-1080',1080,1080,campaign(1080,1080,'square'))
save('03-social','story-reel-cover-1080x1920',1080,1920,campaign(1080,1920,'story'))
save('03-social','x-header-1500x500',1500,500,campaign(1500,500,'wide'))
save('03-social','linkedin-cover-1584x396',1584,396,campaign(1584,396,'wide'))
save('03-social','facebook-cover-1640x624',1640,624,campaign(1640,624,'wide'))
# YouTube: all essential content kept in centered 1546 x 423 safe area.
b=rect(0,0,2560,1440,INK)+mark(1250,180,1100,'#171C10')
b+=lockup(560,540,1)+text('Imagine it. Make it a film.',560,780,86)+text('usefinalframe.xyz',560,884,32,LIME)
save('03-social','youtube-banner-2560x1440',2560,1440,b)
save('04-marketing','link-preview-1200x630',1200,630,campaign(1200,630,'wide'))
save('04-marketing','presentation-cover-1920x1080',1920,1080,campaign(1920,1080,'wide'),pdf=True)
# Print-friendly stationery has no invented address, phone, policies or registration details.
b=rect(0,0,794,1123,WHITE)+mark(55,50,86,INK)+text('FinalFrame',157,111,44,INK)+rect(60,190,674,2,INK)+text('usefinalframe.xyz',60,1060,16,INK)
save('04-marketing','letterhead-A4',794,1123,b,png=False,pdf=True)

# Brand reference board.
b=rect(0,0,1600,1340,'#F4F4F0')+text('FinalFrame / Identity system',70,95,40,INK)
b+=rect(60,140,1480,430,INK,28)+mark(110,200,300,LIME)+text('FinalFrame',450,400,155)
b+=rect(60,610,470,360,WHITE,24)+mark(170,660,250,INK)
b+=rect(565,610,470,360,LIME,24)+mark(675,660,250,INK)
b+=rect(1070,610,470,360,INK,24)+mark(1180,660,250,WHITE)
for x,c,label in [(60,INK,'Midnight / #0B0B0C'),(565,LIME,'Lime / #C6F432'),(1070,WHITE,'White / #FFFFFF')]:
 b+=rect(x,1010,470,90,c,15)+text(label,x,1145,24,INK)
b+=text('One idea. Many scenes. One recognizable identity.',60,1260,34,INK)
save('05-guidelines','brand-overview',1600,1340,b,pdf=True)

pages=[]
def guide(title,subtitle,lines):
 b=rect(0,0,1000,1400,WHITE)+mark(65,45,130,INK)+text('FinalFrame',220,142,56,INK)+text(title,75,280,46,INK)+text(subtitle,75,335,21,INK)
 for i,line in enumerate(lines):b+=text(line,75,435+i*67,22,INK)
 b+=text('FinalFrame brand kit / v1 / November 2026',75,1325,16,INK)
 pages.append(cairosvg.svg2pdf(bytestring=svg(1000,1400,b).encode()))
guide('The identity','A rising pair of frames: stories move forward.',[
 'Use the lime mark with a white wordmark on dark surfaces.',
 'Use the ink version on white or very light backgrounds.',
 'The two offset forms suggest FF and successive film frames.',
 'Keep the artwork flat. No bevels, shadows or extra outlines.',
 'Never stretch, rotate, crop or redraw the mark.',
 'Use supplied SVG or PDF masters for scalable artwork.',
 'Transparent PNG files are included for everyday use.',
 'The AI concept is exploratory; vector masters are final.'
])
guide('Space, size and color','Consistency matters more than decoration.',[
 'Keep clear space of at least 1/4 mark width on every side.',
 'Horizontal logo: 160 px minimum digital, 35 mm in print.',
 'Standard mark: 24 px minimum. Use favicon files below that.',
 'Lime #C6F432 / RGB 198, 244, 50.',
 'Midnight #0B0B0C / RGB 11, 11, 12.',
 'White #FFFFFF / RGB 255, 255, 255.',
 'Lime on white is decorative only; use ink for readable logos.',
 'Print PDFs use RGB. Ask your printer for a CMYK proof.',
 'No color profile or trademark registration is claimed.'
])
guide('Type, words and templates','Speak like a helpful creative partner.',[
 'Wordmark: Manrope Bold, converted to vector outlines.',
 'App headings: Bricolage Grotesque. Body: Manrope.',
 'Both supplied fonts use the SIL Open Font License.',
 'Primary line: Imagine it. Make it a film.',
 'Describe actions simply: Create a video. Review. Download.',
 'Avoid guaranteed outcomes, invented reviews or pricing.',
 'SVG marketing templates can be resized and edited.',
 'Keep text away from profile overlays and crop boundaries.',
 'Check platform previews before publishing a social cover.'
])
guide('What to use where','Choose the asset for the job.',[
 '01-logos: mark, horizontal, stacked and wordmark masters.',
 '02-icons: avatars, app icons, favicon and Apple touch icon.',
 '03-social: square post, story cover and platform headers.',
 '04-marketing: link preview, deck cover and A4 letterhead.',
 'Email signature HTML is a template; sending stays disabled.',
 '05-guidelines: this guide and a visual identity board.',
 'source: reproducible builder, text copy and licensed fonts.',
 'concept: original AI exploration, not the final logo master.',
 'No customer or production data is included in this package.'
])
writer=PdfWriter()
for p in pages:writer.add_page(PdfReader(BytesIO(p)).pages[0])
with open(ROOT/'05-guidelines/brand-guidelines.pdf','wb') as f:writer.write(f)
print('Built brand package')
