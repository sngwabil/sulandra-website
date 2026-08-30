import { Terminal as XtermTerminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ImageAddon } from '@xterm/addon-image';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';
import { LigaturesAddon } from '@xterm/addon-ligatures';

class Terminal extends XtermTerminal {
  open(parent) {
    super.open(parent);
    if (!this.__sulandraLigaturesAddon) {
      try {
        const ligatures = new LigaturesAddon();
        this.loadAddon(ligatures);
        this.__sulandraLigaturesAddon = ligatures;
      } catch (error) {
        console.warn('[Sulandra Terminal] ligatures unavailable; continuing without them', error);
      }
    }
  }
}

export {
  Terminal,
  WebglAddon,
  CanvasAddon,
  FitAddon,
  WebLinksAddon,
  SearchAddon,
  ImageAddon,
  Unicode11Addon,
  SerializeAddon,
  LigaturesAddon,
};
