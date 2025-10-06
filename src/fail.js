const el = document.createElement('button');
el.popover = 'auto';
el.showPopover();
const pattern = new URLPattern('https://example.com/:section');
if (pattern.test('https://example.com/about')) {
  console.log('Matches!');
}