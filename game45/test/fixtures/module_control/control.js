// B-BOOT-C / B-BOOT-CH control: an external module script. Over file:// Chrome blocks it (opaque origin) and the canvas stays empty; over HTTP it paints.
// Two colours (a 640 x 360 rectangle and a 160 x 90 inset): the colour count of one flat fill is 1, below the plan's "colors >= 2" for this control.
const cv = document.getElementById('cv');
const g = cv.getContext('2d');
g.fillStyle = '#c0392b';
g.fillRect(0, 0, 640, 360);
g.fillStyle = '#2471a3';
g.fillRect(40, 40, 160, 90);
globalThis.__ctl = 1;
