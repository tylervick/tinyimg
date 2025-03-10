import { Task } from '../lib/executor';
import '../wasm/wasm_exec';

self.onmessage = async (event: MessageEvent<Task>) => {
  const { type, input } = event.data;
  switch (type) {
    case 'init':
      const taskResult = await runInitTask(input);
      self.postMessage(taskResult);
      break;
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
};

async function runInitTask(module: WebAssembly.Module): Promise<void> {
  const go = new Go();
  const instance = await WebAssembly.instantiate(module, go.importObject);
  // const instance = await WebAssembly.instantiateStreaming(
  //   fetch(init),
  //   go.importObject
  // );
  // todo: set exports
  return await go.run(instance);
}
