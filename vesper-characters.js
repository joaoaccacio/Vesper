/* VESPER — cosmetic character collection. No network, payments, or stat changes. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const originalDraw = VesperGame.prototype._drawCharacter;
  const polygon = (ctx, color, points) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  const oval = (ctx, color, x, y, rx, ry, angle = 0) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU); ctx.fill();
  };
  const line = (ctx, color, width, points) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  };
  const glow = (ctx, color, x, y, radius) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  const boots = (ctx, stride, trousers, leather) => {
    ctx.fillStyle = trousers;
    ctx.fillRect(-8 + stride, 6, 5, 10); ctx.fillRect(3 - stride, 6, 5, 10);
    ctx.fillStyle = leather;
    ctx.fillRect(-9 + stride, 14, 7, 5); ctx.fillRect(2 - stride, 14, 8, 5);
  };

  const drawings = {
    vampire(ctx, steps) {
      const stride = Math.sin(steps) * 1.4;
      const sway = Math.sin(this._clock * 2.8) * 1.6;
      // A wine-red lining makes the long black cloak readable on dark maps.
      polygon(ctx, '#231c2b', [[-11,-12],[-24+sway,15],[-13,19],[-4,15],[6,20],[22+sway,16],[11,-12]]);
      polygon(ctx, '#8f293e', [[-10,-12],[-20+sway,14],[-11,15],[-4,8],[4,17],[17+sway,14],[9,-12]]);
      line(ctx, '#c7505a', 0.9, [[-11,-7],[-19+sway,13],[-12,15]]);
      boots(ctx, stride, '#272331', '#14161f');
      polygon(ctx, '#33303f', [[-8,-10],[9,-10],[11,12],[3,10],[0,13],[-10,11]]);
      polygon(ctx, '#e7ddca', [[-4,-9],[6,-9],[4,3],[0,6]]);
      polygon(ctx, '#722d42', [[-8,-8],[-3,-6],[0,6],[-3,11],[-10,10]]);
      polygon(ctx, '#4c273e', [[7,-8],[10,10],[4,10],[2,6],[5,-5]]);
      line(ctx, '#d3ab6d', 0.8, [[-3,-5],[-1,1],[-2,6],[-3,9]]);
      oval(ctx, '#cca25d', 0, 5, 1, 1);
      oval(ctx, '#cca25d', 0, 8, 1, 1);
      polygon(ctx, '#ad4051', [[-9,-6],[-16,-20],[-4,-12],[2,-5],[9,-12],[18,-20],[11,-5]]);
      polygon(ctx, '#3b2636', [[-10,-8],[-13,-16],[-3,-10],[2,-5],[10,-11],[15,-16],[11,-6]]);
      oval(ctx, '#d8d5d4', 1, -18, 8.2, 9.1);
      oval(ctx, '#aeaab8', -6.6, -18, 2, 3.3);
      polygon(ctx, '#171b29', [[-7,-17],[-9,-27],[-4,-32],[5,-32],[10,-27],[9,-17],[6,-23],[2,-27],[-1,-23],[-4,-24]]);
      line(ctx, '#515167', 1, [[-6,-27],[-3,-29],[3,-30],[7,-27]]);
      polygon(ctx, '#b9b5c6', [[-5,-17],[-3,-12],[1,-10],[-2,-10],[-6,-13]]);
      line(ctx, '#4a384e', 1.3, [[-4,-20],[-1,-19]]);
      line(ctx, '#4a384e', 1.3, [[4,-19],[7,-20]]);
      oval(ctx, '#b92746', -2, -17.8, 1.5, 1.1);
      oval(ctx, '#b92746', 5.5, -17.8, 1.5, 1.1);
      oval(ctx, '#fff0dc', -1.6, -18.1, 0.5, 0.5);
      oval(ctx, '#fff0dc', 5.9, -18.1, 0.5, 0.5);
      line(ctx, '#764553', 1, [[-1,-12],[4,-12]]);
      polygon(ctx, '#fff8e3', [[-1,-12],[1,-12],[0,-8.9]]);
      polygon(ctx, '#fff8e3', [[3,-12],[5,-12],[4,-9.2]]);
      polygon(ctx, '#b7515e', [[0,-7],[3,-7],[1.5,-4]]);
      polygon(ctx, '#33303f', [[7,-7],[15,-2],[13,3],[6,-1]]);
      oval(ctx, '#d8d5d4', 14, 2, 3, 2.7);
      line(ctx, '#9c7851', 1.6, [[16,14],[18,-7]]);
      oval(ctx, '#d9b15b', 18, -8, 2.2, 2.2);
      oval(ctx, '#ab314b', 18, -8.5, 1.1, 1.1);
    },

    mummy(ctx, steps) {
      const stride = Math.sin(steps) * 1.3;
      const flutter = Math.sin(this._clock * 4) * 2;
      // Loose linen ribbons and a lapis/gold headdress carry the pharaoh silhouette.
      polygon(ctx, '#a78e65', [[-8,-3],[-15,4],[-16,10],[-22+flutter,14],[-19+flutter,9],[-19,2],[-10,-6]]);
      polygon(ctx, '#c3ad83', [[10,3],[16,7],[20,4],[24,7+flutter],[19,8+flutter],[16,10],[8,7]]);
      boots(ctx, stride, '#bda987', '#8f7959');
      for (const x of [-8 + stride, 3 - stride]) {
        line(ctx, '#e0d0ac', 1.3, [[x,8],[x+5,9]]);
        line(ctx, '#837454', 0.7, [[x,11],[x+5,12]]);
        line(ctx, '#dcca9d', 1.3, [[x,13],[x+5,14]]);
        line(ctx, '#dcca9d', 1, [[x-1,16],[x+5,16]]);
      }
      polygon(ctx, '#b9a582', [[-8,-10],[8,-10],[11,9],[6,12],[-9,11]]);
      polygon(ctx, '#decdab', [[-7,-9],[-1,-9],[4,11],[-3,11]]);
      line(ctx, '#8a795b', 0.9, [[-8,-6],[9,-3]]);
      line(ctx, '#8a795b', 0.9, [[-9,-1],[10,2]]);
      line(ctx, '#8a795b', 0.9, [[-9,4],[10,7]]);
      line(ctx, '#ede0bf', 1.2, [[-7,-4],[9,-1]]);
      line(ctx, '#ede0bf', 1.2, [[-8,1],[9,4]]);
      polygon(ctx, '#265966', [[-10,3],[10,3],[7,12],[0,16],[-7,12]]);
      line(ctx, '#d7b167', 1.3, [[-10,3],[10,3],[7,12],[0,16],[-7,12],[-10,3]]);
      polygon(ctx, '#d7b167', [[-2,4],[2,4],[3,12],[0,14],[-3,12]]);
      oval(ctx, '#a8d3c4', 0, 6, 1.2, 1.2);
      polygon(ctx, '#bda987', [[-8,-7],[-14,-5],[-15,3],[-11,6],[-9,1],[-5,-3]]);
      line(ctx, '#e5d3af', 1.4, [[-13,-2],[-10,0]]);
      line(ctx, '#7f7256', 0.7, [[-14,1],[-11,3]]);
      oval(ctx, '#d4c19a', -12.5, 5, 2.7, 3);
      polygon(ctx, '#205363', [[-9,-25],[-14,-16],[-13,-4],[-7,-7],[0,-16],[8,-7],[15,-4],[15,-19],[9,-27]]);
      for (const side of [-1,1]) {
        for (let i = 0; i < 4; i++) line(ctx, '#d6ad60', 1.5, [[side*(9+i*.5),-19+i*4],[side*(13+i*.3),-17+i*4]]);
      }
      oval(ctx, '#d4c3a0', 1, -18, 8.4, 10);
      polygon(ctx, '#a18e6c', [[-7,-19],[-5,-12],[0,-9],[-3,-10],[-7,-14]]);
      line(ctx, '#f0e1bb', 2.1, [[-6,-25],[7,-23]]);
      line(ctx, '#9a8867', 0.8, [[-7,-22],[9,-20]]);
      polygon(ctx, '#253c3a', [[-5,-20],[8,-19],[7,-15],[-5,-15]]);
      glow(ctx, 'rgba(151,225,165,.35)', 1, -17, 9);
      oval(ctx, '#dcf5ab', -2.4, -17.3, 1.6, 1.1);
      oval(ctx, '#dcf5ab', 5.4, -17, 1.6, 1.1);
      line(ctx, '#eedcba', 2.3, [[-5,-13],[7,-12]]);
      line(ctx, '#a49374', 0.7, [[-3,-10],[5,-10]]);
      polygon(ctx, '#d7b167', [[-10,-26],[-7,-30],[7,-30],[11,-26],[9,-23],[-8,-23]]);
      line(ctx, '#f2d99d', 1, [[-7,-28],[8,-28]]);
      polygon(ctx, '#317b87', [[-2,-30],[2,-30],[3,-25],[0,-22],[-3,-25]]);
      oval(ctx, '#f0d896', 0, -31, 1.8, 2);
      polygon(ctx, '#bda987', [[7,-7],[14,-4],[15,2],[11,4],[6,-2]]);
      line(ctx, '#e8d8b5', 1.3, [[11,-4],[13,1]]);
      line(ctx, '#876f48', 2.8, [[17,16],[19,-14]]);
      line(ctx, '#e0ba71', 1, [[18,14],[20,-13]]);
      line(ctx, '#d7b167', 2.5, [[19,-14],[16,-19],[18,-24],[23,-24],[25,-21]]);
      oval(ctx, '#d4c19a', 15, 1.5, 3, 2.8);
    },

    zombie(ctx, steps) {
      const stride = Math.sin(steps) * 1.7;
      // The mismatched sleeves, crooked jaw and patched coat read even at game scale.
      boots(ctx, stride, '#423e36', '#352c29');
      ctx.fillStyle = '#9a9c71'; ctx.fillRect(3-stride,11,5,4);
      line(ctx, '#686d4c', 0.8, [[4-stride,12],[7-stride,13]]);
      polygon(ctx, '#4c5960', [[-10,-8],[7,-9],[11,10],[5,8],[2,13],[-3,10],[-10,12],[-12,3]]);
      polygon(ctx, '#72816b', [[-3,-8],[6,-8],[5,7],[-2,6]]);
      polygon(ctx, '#596972', [[-10,-6],[-5,-8],[-7,8],[-12,10]]);
      polygon(ctx, '#394853', [[7,-8],[12,11],[5,8],[2,10],[3,-5]]);
      polygon(ctx, '#b1996c', [[-10,3],[-5,2],[-4,7],[-9,8]]);
      line(ctx, '#d9c49b', 0.7, [[-9,2],[-9,4],[-6,2],[-6,4],[-10,6],[-8,6],[-7,7],[-5,7]]);
      line(ctx, '#2f3c3d', 1.4, [[-2,-3],[3,-2],[-1,2],[4,3]]);
      polygon(ctx, '#566770', [[-9,-6],[-17,-7],[-18,0],[-12,2],[-6,-1]]);
      polygon(ctx, '#83946e', [[-18,-6],[-22,-4],[-20,1],[-16,1],[-15,-3]]);
      line(ctx, '#4b6348', 0.7, [[-21,-3],[-18,-3],[-20,-1],[-17,-1]]);
      polygon(ctx, '#82966b', [[7,-7],[14,-2],[18,-1],[19,4],[12,4],[5,-1]]);
      line(ctx, '#455746', 0.8, [[11,-2],[13,1],[14,-3],[16,0]]);
      oval(ctx, '#82996d', 0, -18, 9.2, 10.5, -0.12);
      oval(ctx, '#a3b086', 2, -21, 6.1, 6.5, -0.1);
      polygon(ctx, '#52684d', [[-8,-20],[-8,-13],[-3,-9],[1,-9],[-3,-14],[-5,-20]]);
      polygon(ctx, '#343c37', [[-9,-20],[-10,-27],[-5,-31],[-1,-29],[2,-32],[7,-29],[10,-23],[7,-23],[5,-26],[0,-24],[-3,-27],[-7,-20]]);
      line(ctx, '#626c50', 1, [[-7,-27],[-4,-29],[-1,-27]]);
      oval(ctx, '#3b4a3c', -3.5, -18, 3.3, 3.2);
      oval(ctx, '#344736', 5, -17.2, 2.4, 2.7);
      oval(ctx, '#e4d59d', -3.2, -17.8, 1.5, 1.6);
      oval(ctx, '#dca77b', 5.5, -17, 1.1, 1.1);
      line(ctx, '#665746', 1, [[-3,-12],[4,-10],[7,-12]]);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-1,-12,1.5,2); ctx.fillRect(3,-11.5,1.5,2);
      line(ctx, '#485c44', 0.8, [[2,-25],[6,-23]]);
      line(ctx, '#d0c29d', 0.8, [[3,-26],[2,-23],[5,-25],[4,-22]]);
      oval(ctx, '#677e53', -5, -11, 1.1, 1.1);
      polygon(ctx, '#7c3b3f', [[-7,-9],[2,-8],[6,-10],[5,-5],[-3,-5],[-8,-7]]);
      polygon(ctx, '#994b47', [[-6,-6],[-9,1],[-5,0],[-2,-5]]);
    },

    jack(ctx, steps) {
      const stride = Math.sin(steps) * 1.8;
      const sway = Math.sin(this._clock * 3) * 1.5;
      line(ctx, '#554633', 4, [[-5,7],[-6+stride,14],[-10+stride,18]]);
      line(ctx, '#63503a', 4, [[5,7],[6-stride,15],[10-stride,18]]);
      line(ctx, '#a58349', 1, [[-5,9],[-6+stride,15],[-10+stride,18]]);
      line(ctx, '#ad864b', 1, [[6,9],[7-stride,15],[10-stride,18]]);
      line(ctx, '#554633', 1.5, [[-7+stride,16],[-12+stride,16],[-14+stride,18]]);
      line(ctx, '#63503a', 1.5, [[8-stride,16],[13-stride,15],[15-stride,17]]);
      polygon(ctx, '#382d45', [[-9,-8],[8,-8],[14,12],[6,9],[3,15],[-2,11],[-9,14],[-7,7],[-14,10]]);
      polygon(ctx, '#59405f', [[-8,-6],[-13,10],[-7,7],[-9,12],[-4,9],[-1,-3]]);
      polygon(ctx, '#695375', [[1,-5],[7,-7],[12,10],[6,7],[3,12]]);
      line(ctx, '#99729a', 0.8, [[7,-5],[10,7],[6,5]]);
      line(ctx, '#483b30', 4, [[-7,-5],[-14,-2],[-17,4]]);
      line(ctx, '#896c3c', 1.2, [[-8,-6],[-14,-2],[-17,4],[-20,3]]);
      line(ctx, '#896c3c', 1.2, [[-16,2],[-16,6],[-18,8]]);
      line(ctx, '#55432e', 4, [[8,-5],[13,-1],[17,2]]);
      line(ctx, '#a28548', 1.2, [[9,-6],[14,-2],[18,2],[22,0]]);
      line(ctx, '#a28548', 1.2, [[17,1],[21,5],[23,4]]);
      polygon(ctx, '#8b7439', [[-10,-11],[-7,-5],[-3,-8],[0,-3],[4,-8],[8,-6],[12,-13],[3,-9]]);
      polygon(ctx, '#c18d3c', [[-9,-11],[-6,-7],[-4,-10],[0,-5],[4,-10],[8,-8],[10,-12],[1,-10]]);
      glow(ctx, 'rgba(255,153,48,.13)', 1, -20, 23);
      oval(ctx, '#ac4b25', 1, -20, 14.2, 12.4);
      oval(ctx, '#d8702d', -4, -20.5, 8, 11.6);
      oval(ctx, '#e58c37', 3, -20.5, 8.3, 12);
      oval(ctx, '#d7742a', 8, -19.5, 5.7, 10.5);
      ctx.strokeStyle = '#a94a23'; ctx.lineWidth = 0.9;
      for (const side of [-1,1]) {
        ctx.beginPath(); ctx.moveTo(1,-31); ctx.bezierCurveTo(side*9,-27,side*9,-13,1,-8); ctx.stroke();
      }
      polygon(ctx, '#756036', [[-1,-30],[-2,-36],[1,-39],[4,-38],[1,-35],[3,-30]]);
      line(ctx, '#bea66a', 0.9, [[0,-31],[0,-35],[2,-37]]);
      polygon(ctx, '#71864b', [[2,-32],[7,-37],[12,-35],[7,-31]]);
      line(ctx, '#a4af60', 0.7, [[3,-32],[9,-35]]);
      polygon(ctx, '#613020', [[-10,-22],[-3,-25],[-1,-18],[-7,-18]]);
      polygon(ctx, '#613020', [[4,-25],[12,-22],[9,-18],[3,-18]]);
      polygon(ctx, '#ffe197', [[-8,-22],[-3.5,-23.5],[-2.5,-19.5],[-6.5,-19.5]]);
      polygon(ctx, '#ffe197', [[5,-23.5],[10,-22],[8.5,-19.5],[4.5,-19.5]]);
      polygon(ctx, '#4d2c22', [[-8,-15],[-4,-14],[-3,-16],[0,-13],[3,-15],[5,-13],[10,-16],[7,-10],[2,-9],[-4,-10]]);
      polygon(ctx, '#ffc96b', [[-6,-13.5],[-3,-12],[-1,-13],[1,-11],[4,-12],[5,-11],[8,-13],[6,-10.5],[1,-10],[-3,-11]]);
      oval(ctx, '#f5c573', 1, 0, 1.2, 1.2);
      oval(ctx, '#f5c573', 2, 4, 1.1, 1.1);
      polygon(ctx, '#897146', [[-8,9],[-12+sway,14],[-11+sway,18],[-14+sway,15],[-14+sway,12]]);
    },

    survivor(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      // The original watchman's face, coat cut and sword survive under field repairs.
      polygon(ctx, '#4b4937', [[-10,-10],[-15,-7],[-15,8],[-9,11],[-6,6],[-6,-8]]);
      oval(ctx, '#67614b', -11.5, -9, 5, 3.3);
      line(ctx, '#a69267', 1, [[-15,-7],[-8,-6],[-8,8],[-14,6]]);
      ctx.fillStyle = '#777256'; ctx.fillRect(-16,-5,4,8);
      line(ctx, '#baa17a', 0.8, [[-15,-3],[-13,-3],[-15,1],[-13,1]]);
      boots(ctx, stride, '#303b3c', '#513d2b');
      line(ctx, '#9a8162', 1, [[-8+stride,16],[-3+stride,16]]);
      ctx.fillStyle = '#9d9580'; ctx.fillRect(3-stride,9,5,4);
      line(ctx, '#d7cbb1', 0.7, [[3-stride,10],[8-stride,11]]);
      polygon(ctx, '#315462', [[-9,-9],[9,-9],[12,12],[8,9],[4,12],[0,10],[-4,13],[-8,10],[-12,12]]);
      polygon(ctx, '#4e7280', [[-8,-7],[-4,-9],[-5,4],[-10,10]]);
      ctx.fillStyle = '#b7b397'; ctx.fillRect(-1.5,-8,4,10);
      polygon(ctx, '#596453', [[6,3],[10,4],[11,9],[6,8]]);
      line(ctx, '#b6b497', 0.7, [[6,4],[8,5],[8,3],[8,5],[9,7],[11,7]]);
      line(ctx, '#2a4048', 1, [[-7,7],[-4,8],[-5,6],[-2,7]]);
      polygon(ctx, '#614a32', [[-7,-9],[-3,-9],[7,6],[4,8]]);
      line(ctx, '#a78a5f', 0.8, [[-6,-8],[5,7]]);
      ctx.fillStyle = '#5a3b27'; ctx.fillRect(-10,2,21,3);
      ctx.fillStyle = '#cbaa6c'; ctx.fillRect(0,1.5,4,4);
      ctx.fillStyle = '#7e694c'; ctx.fillRect(-9,3,5,5);
      ctx.fillStyle = '#b79a6d'; ctx.fillRect(-8,3,3,1);
      polygon(ctx, '#315462', [[-8,-6],[-13,3],[-9,5],[-4,-2]]);
      oval(ctx, '#bfa187', -11, 5, 2.7, 2.7);
      line(ctx, '#d3cfb4', 1.5, [[-12,1],[-8,3]]);
      oval(ctx, '#d7a784', 1, -17, 7.5, 8);
      polygon(ctx, '#4c3020', [[-7,-15],[-9,-24],[-4,-28],[2,-27],[6,-29],[10,-24],[9,-19],[5,-21],[1,-18],[-2,-21],[-4,-14]]);
      line(ctx, '#785039', 1.1, [[-5,-25],[0,-26],[4,-24],[7,-25]]);
      polygon(ctx, '#845746', [[-5,-14],[-2,-11],[3,-10],[7,-13],[5,-9],[0,-8],[-4,-10]]);
      ctx.fillStyle = '#231a15'; ctx.fillRect(0,-17,2,2.4); ctx.fillRect(5,-17,2,2.4);
      line(ctx, '#ae655b', 1, [[5,-21],[3.5,-14]]);
      line(ctx, '#e5ba91', 0.65, [[4.5,-20],[6,-20],[4,-17],[5.5,-17]]);
      polygon(ctx, '#8b3738', [[-7,-12],[-1,-10],[8,-11],[7,-6],[1,-5],[-7,-7]]);
      polygon(ctx, '#b05047', [[-6,-7],[-12,-1],[-10,2],[-7,-2],[-3,-5]]);
      line(ctx, '#d77962', 0.8, [[-5,-8],[0,-7],[6,-8]]);
      polygon(ctx, '#315462', [[6,-8],[14,-1],[11,3],[4,-3]]);
      line(ctx, '#b8bcae', 2.8, [[15,-3],[22,-27]]);
      line(ctx, '#ebebd6', 0.9, [[15.7,-5],[22.2,-26]]);
      polygon(ctx, '#c9d1c6', [[20.5,-26],[23.5,-32],[23.5,-25.5]]);
      line(ctx, '#6e807b', 1, [[19,-19],[22,-18]]);
      line(ctx, '#b89a5f', 2.2, [[10,-3],[19,0]]);
      line(ctx, '#513b29', 2.6, [[14,-1],[12.5,4]]);
      oval(ctx, '#d2a07e', 13.5, 0.5, 2.8, 2.8);
      line(ctx, '#ccc3a5', 1.3, [[12,1],[15,2]]);
    },

    skeleton(ctx, steps) {
      const stride = Math.sin(steps) * 1.5;
      // Ivory bones sit above a short indigo mantle, separate from ordinary skeletons.
      polygon(ctx, '#313746', [[-9,-9],[-16,8],[-10,6],[-11,13],[-4,8],[4,12],[12,9],[9,-8]]);
      line(ctx, '#69708b', 0.8, [[-10,-5],[-14,6],[-9,5]]);
      for (const side of [-1,1]) {
        const dx = side < 0 ? stride : -stride;
        line(ctx, '#938d76', 3.5, [[side*4,6],[side*6+dx,12],[side*5+dx,17]]);
        line(ctx, '#e4dcc0', 1.8, [[side*4+.5,7],[side*6+dx+.5,12],[side*5+dx+.5,16]]);
        oval(ctx, '#d2c9ac', side*6+dx, 12, 2, 2);
        oval(ctx, '#d2c9ac', side*6+dx, 18, 4, 1.8);
        line(ctx, '#928c76', 0.8, [[side*6+dx,17],[side*6+dx,19]]);
      }
      line(ctx, '#d4cdb3', 3, [[0,-8],[0,7]]);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 0 ? '#e2dbc1' : '#c7bfa4'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-7,-5+i*3.3); ctx.quadraticCurveTo(-8,-1+i*3.3,-1,-2+i*3.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7,-5+i*3.3); ctx.quadraticCurveTo(8,-1+i*3.3,1,-2+i*3.3); ctx.stroke();
      }
      polygon(ctx, '#c8bda0', [[-7,5],[-5,9],[-1,9],[0,7],[2,9],[6,9],[8,5],[3,4],[0,5],[-3,4]]);
      oval(ctx, '#272f33', -3.8, 6.2, 1.5, 0.8); oval(ctx, '#272f33', 4, 6.2, 1.5, 0.8);
      line(ctx, '#c8bfa2', 2.5, [[-6,-6],[-12,-3],[-13,4],[-17,5]]);
      line(ctx, '#eee1bf', 1, [[-11,-3],[-12,3]]);
      oval(ctx, '#c8bfa2', -13, 4, 2, 2);
      line(ctx, '#c8bfa2', 2.5, [[6,-6],[12,-3],[15,3]]);
      oval(ctx, '#dacfad', 15, 3, 2.7, 2.3);
      oval(ctx, '#e2d8ba', 0.5, -21, 10, 11.3);
      polygon(ctx, '#b4aa8e', [[-9,-24],[-8,-15],[-4,-10],[-1,-10],[-4,-15],[-6,-24]]);
      polygon(ctx, '#e2d8ba', [[-6,-15],[7,-15],[6,-9],[-5,-9]]);
      oval(ctx, '#333b38', -3.8, -21, 3.2, 3.5, 0.2);
      oval(ctx, '#333b38', 5, -21, 3.3, 3.5, -0.2);
      oval(ctx, '#b9e4c5', -3.1, -21, 1.2, 1.3);
      oval(ctx, '#b9e4c5', 5.7, -21, 1.2, 1.3);
      polygon(ctx, '#5b6051', [[.4,-18],[-1.2,-15],[2.4,-15]]);
      line(ctx, '#887f68', 0.9, [[-4,-12],[5,-12]]);
      for (let i = -3; i <= 4; i += 2.3) line(ctx, '#918871', 0.8, [[i,-13.5],[i,-10]]);
      line(ctx, '#a79d80', 0.8, [[1,-31],[-1,-27],[2,-26],[1,-24]]);
      polygon(ctx, '#615670', [[-8,-10],[0,-8],[8,-11],[7,-7],[1,-5],[-6,-6]]);
      oval(ctx, '#c4a668', 1, -7, 1.4, 1.4);
      line(ctx, '#6a5742', 2.4, [[17,15],[20,-21]]);
      polygon(ctx, '#adb8af', [[20,-26],[24,-23],[30,-16],[30,-9],[27,-13],[24,-16],[19,-18]]);
      line(ctx, '#dee7d7', 0.9, [[23,-23],[28,-16],[29,-11]]);
      line(ctx, '#c7aa6c', 1.8, [[17,-18],[22,-18]]);
    },

    witch(ctx, steps) {
      const stride = Math.sin(steps) * 1.2;
      boots(ctx, stride, '#302537', '#241f2c');
      polygon(ctx, '#443049', [[-8,-10],[7,-10],[16,16],[9,14],[5,18],[-3,16],[-10,18],[-16,15]]);
      polygon(ctx, '#745079', [[-7,-8],[-3,-10],[-5,14],[-11,15],[-13,13]]);
      polygon(ctx, '#58375f', [[2,-9],[7,-9],[13,14],[8,13],[4,16]]);
      line(ctx, '#a57bad', 0.8, [[-8,-5],[-12,13],[-8,14]]);
      line(ctx, '#927399', 0.8, [[8,1],[12,13],[9,12]]);
      polygon(ctx, '#aa8870', [[-8,-2],[9,-2],[10,1],[-9,1]]);
      ctx.fillStyle = '#dcb977'; ctx.fillRect(-1,-2.7,4,4.2);
      ctx.fillStyle = '#5f3b61'; ctx.fillRect(0,-1.7,2,2.2);
      polygon(ctx, '#483048', [[-8,-7],[-14,1],[-11,5],[-5,-2]]);
      oval(ctx, '#b4b58b', -12.4, 5, 2.8, 2.8);
      polygon(ctx, '#483048', [[7,-7],[14,-1],[13,3],[5,-2]]);
      // Warm silver hair peeks out below the brim and frames a sage-green face.
      polygon(ctx, '#bac1b2', [[-8,-23],[-11,-12],[-13,-5],[-7,-7],[-8,-3],[-2,-8],[6,-6],[11,-4],[8,-14],[9,-25]]);
      polygon(ctx, '#80978a', [[-7,-22],[-9,-11],[-6,-8],[-5,-16]]);
      oval(ctx, '#b7bea0', 1, -18, 7.5, 8.2);
      polygon(ctx, '#a6ac8d', [[-5,-16],[-2,-10],[4,-10],[6,-13],[2,-11]]);
      polygon(ctx, '#d4d6b9', [[5,-18],[10,-15],[6,-14]]);
      line(ctx, '#6e645f', 1.2, [[-3,-19],[0,-19]]);
      line(ctx, '#6e645f', 1.2, [[4,-19],[7,-20]]);
      oval(ctx, '#283a33', -1.5, -17.4, 1.1, 1.3);
      oval(ctx, '#283a33', 5.5, -17.6, 1.1, 1.3);
      line(ctx, '#846569', 0.8, [[0,-12],[4,-12]]);
      oval(ctx, '#d8b55e', -6.2, -13, 1.1, 1.7);
      polygon(ctx, '#3d294d', [[-12,-24],[-7,-34],[-4,-45],[4,-43],[8,-38],[13,-37],[9,-33],[6,-33],[12,-23]]);
      polygon(ctx, '#72507e', [[-10,-25],[-6,-34],[-3,-43],[1,-41],[0,-34],[5,-23]]);
      line(ctx, '#9570a0', 0.9, [[-8,-28],[-4,-40],[-3,-43],[1,-42]]);
      polygon(ctx, '#79513e', [[-10,-27],[8,-28],[11,-23],[-12,-22]]);
      polygon(ctx, '#d3ad67', [[-1,-27],[4,-27],[5,-23],[-1,-23]]);
      ctx.fillStyle = '#3d294d'; ctx.fillRect(0,-26,3,2);
      ctx.fillStyle = '#48334f';
      ctx.beginPath(); ctx.moveTo(-21,-21); ctx.quadraticCurveTo(-10,-27,1,-25); ctx.quadraticCurveTo(14,-25,21,-20); ctx.quadraticCurveTo(12,-17,3,-20); ctx.quadraticCurveTo(-9,-17,-21,-21); ctx.fill();
      ctx.strokeStyle = '#a27fa6'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-19,-21); ctx.quadraticCurveTo(-10,-23,-3,-22); ctx.stroke();
      line(ctx, '#796442', 2.5, [[16,15],[19,-17]]);
      line(ctx, '#b69b66', 0.8, [[17,13],[20,-17]]);
      polygon(ctx, '#b7a064', [[15,9],[19,9],[24,18],[19,16],[17,19],[13,17]]);
      line(ctx, '#e0c584', 0.8, [[16,11],[15,16],[18,11],[20,16]]);
      line(ctx, '#775342', 1.6, [[14,9],[20,9]]);
      glow(ctx, 'rgba(171,212,128,.26)', 19, -19, 8);
      oval(ctx, '#abd79a', 19, -19, 2.8, 3.4);
      oval(ctx, '#e4f3b9', 19.4, -20, 1, 1.5);
      oval(ctx, '#b4b58b', 15, 1.7, 3, 2.8);
    }
  };

  VesperGame.CHARACTERS = Object.freeze([
    { id: 'human', name: 'Humano', unlockType: 'free', accent: '#79a2b0' },
    { id: 'ghost', name: 'Fantasma', unlockType: 'free', accent: '#b2d8d0' },
    { id: 'hooded', name: 'Encapuzado', unlockType: 'free', accent: '#bd8292' },
    { id: 'vampire', name: 'Vampiro', unlockType: 'map', unlockMap: 'castle', accent: '#d87783' },
    { id: 'mummy', name: 'Múmia', unlockType: 'map', unlockMap: 'egypt', accent: '#dabb76' },
    { id: 'zombie', name: 'Zumbi', unlockType: 'map', unlockMap: 'swamp', accent: '#a3ba83' },
    { id: 'jack', name: 'Jack o’ Lantern', unlockType: 'map', unlockMap: 'halloween', accent: '#edab66' },
    { id: 'survivor', name: 'Sobrevivente', unlockType: 'all', accent: '#d8c185' },
    { id: 'alien', name: 'Alien', unlockType: 'coins', accent: '#a4d989' },
    { id: 'spider', name: 'Aranha', unlockType: 'coins', accent: '#bc91c7' },
    { id: 'skeleton', name: 'Esqueleto', unlockType: 'coins', accent: '#d9d1b5' },
    { id: 'witch', name: 'Bruxa', unlockType: 'coins', accent: '#c299d0' }
  ].map(character => Object.freeze(character)));

  VesperGame.prototype._drawCharacter = function (ctx, id, steps = 0) {
    if (!Object.prototype.hasOwnProperty.call(drawings, id)) {
      originalDraw.call(this, ctx, id, steps);
      return;
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawings[id].call(this, ctx, steps);
    ctx.restore();
  };

  VesperGame.prototype.drawCharacterPreview = function (canvas, id, locked = false) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return;
    const { width, height } = canvas;
    const scale = Math.min(width / 76, height / 80);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2, height * 0.65);
    ctx.scale(scale, scale);
    oval(ctx, 'rgba(0,0,0,.26)', 0, 18, 22, 6);
    ctx.globalAlpha = locked ? 0.8 : 1;
    this._drawCharacter(ctx, id, 0);
    ctx.restore();
  };
})();
