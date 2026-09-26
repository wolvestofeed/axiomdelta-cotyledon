/**
 * The front door's background: the logo mark's landscape carried across the page — the sky,
 * then the top, middle and bottom soil bands starting at the mark's own heights (57.5%, 73%, 84.5%). Each band's
 * top edge is a gentle wave drawn at a fixed height and cropped, never stretched, so it keeps its shape at any
 * width. Colours are the logo file's own.
 */
const BANDS = [
  { top: '57.5%', fill: '#B8733A', d: 'M0,26 C260,8 460,4 720,16 C980,28 1200,36 1460,21 C1530,17 1570,15 1600,17 V48 H0Z' },
  { top: '73%', fill: '#8E5323', d: 'M0,24 C380,14 780,31 1180,24 C1380,20 1510,16 1600,19 V48 H0Z' },
  { top: '84.5%', fill: '#6B3C1A', d: 'M0,23 C480,16 980,29 1480,22 C1530,21 1570,20 1600,21 V48 H0Z' },
];

export function FrontDoorLandscape() {
  return (
    <div className="farm-front-landscape" aria-hidden="true">
      {BANDS.map((b) => (
        <div key={b.top} className="farm-front-band" style={{ top: b.top, background: b.fill }}>
          <svg viewBox="0 0 1600 48" preserveAspectRatio="xMidYMax slice" focusable="false">
            <path d={b.d} fill={b.fill} />
          </svg>
        </div>
      ))}
    </div>
  );
}
