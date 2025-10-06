const data = [1, 2, 3];
console.log(data.at(-1)); // 3

fetch('https://example.com')
  .then(response => response.json())
  .then(data => console.log(data));