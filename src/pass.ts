const channel = new BroadcastChannel('my-channel');
channel.postMessage('Hello from TS!');

channel.addEventListener('message', (event) => {
  console.log(event.data);
});