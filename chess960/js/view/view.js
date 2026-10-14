// Facade over the 3D layer: the game controller only talks to this.
import { Engine } from './engine.js';
import { Board3D } from './board3d.js';
import { Pieces3D } from './pieces3d.js';
import { FX3D } from './fx3d.js';
import { buildWorld } from './world.js';

export class ChessView {
  constructor(container) {
    this.engine = new Engine(container);
    this.board = new Board3D(this.engine);
    this.fx = new FX3D(this.engine);
    this.pieces = new Pieces3D(this.engine, this.fx);
    this.world = null;

    this.engine.onQualityChange = (name, q) => {
      this.world?.applyQuality(q);
      this.onQualityChange?.(name);
    };
    this.engine.onTap = (e) => this.onSquare?.(this.pick(e));
    this.engine.onHover = (e) => this.onHoverSquare?.(this.pick(e));
  }

  pick(e) {
    const hits = this.engine.raycast(e, [...this.board.tiles, ...this.pieces.pickables()]);
    for (const h of hits) {
      if (h.object.userData.sq) return h.object.userData.sq;
      const sq = this.pieces.squareOf(h.object.parent);
      if (sq) return sq;
    }
    return null;
  }

  setTheme(theme, board) {
    this.world?.dispose();
    this.fx.clear();
    this.world = buildWorld(this.engine, theme);
    this.board.build(theme);
    this.pieces.setTheme(theme);
    if (board) this.pieces.sync(board, { intro: true });
  }

  sync(board, opts) { this.pieces.sync(board, opts); }
  setMarks(marks) { this.board.setMarks(marks); }
  setHover(sq) { this.board.setHover(sq); }
  select(sq) { this.pieces.select(sq); }
  setQualityMode(mode) { this.engine.setQualityMode(mode); }
  get quality() { return this.engine.quality; }

  async playMove(move, opts) {
    await this.pieces.animateMove(move, opts);
    if (opts.cinematic && (move.captured)) await this.engine.resetCamera(0.9);
  }

  flip() {
    this.engine.side = this.engine.side === 'w' ? 'b' : 'w';
    this.board.setOrientation(this.engine.side);
    return this.engine.resetCamera(1.4);
  }

  resetCamera() { return this.engine.resetCamera(0.8); }
  shake(a) { this.engine.shake(a); }
}
