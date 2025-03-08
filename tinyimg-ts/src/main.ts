import tiff2jpeg from './lib/tiff2jpeg';

export default tiff2jpeg;

declare global {
  interface Window {
    tinyimg: typeof tiff2jpeg;
  }
}
