const el = document.createElement('button');
el.popover = 'auto';
el.showPopover();
if (pattern.test('https://example.com/about')) {
  console.log('Matches!');
}