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
  const radial = (ctx, x, y, radius, stops) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stops.forEach(([at, color]) => gradient.addColorStop(at, color));
    return gradient;
  };
  const star = (ctx, color, x, y, radius) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const reach = i % 2 ? radius * 0.45 : radius;
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath(); ctx.fill();
  };
  const boots = (ctx, stride, trousers, leather) => {
    ctx.fillStyle = trousers;
    ctx.fillRect(-8 + stride, 6, 5, 10); ctx.fillRect(3 - stride, 6, 5, 10);
    ctx.fillStyle = leather;
    ctx.fillRect(-9 + stride, 14, 7, 5); ctx.fillRect(2 - stride, 14, 8, 5);
  };

  const shag = (ctx, color, x, y, rx, ry, count, depth, angle = 0) => {
    const step = TAU / count;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = i * step, tip = a + step * 0.6, reach = 1 + depth * (0.75 + 0.25 * Math.sin(i * 2.3));
      ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
      ctx.lineTo(Math.cos(tip) * rx * reach, Math.sin(tip) * ry * reach);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  const drawings = {
    vampire(ctx, steps) {
      const stride = Math.sin(steps) * 1.4;
      const sway = Math.sin(this._clock * 2.8) * 1.6;
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
      line(ctx, '#483323', 4.4, [[12,8],[15,-4],[18,-16],[21,-29]]);
      line(ctx, '#90714c', 2.7, [[12,8],[15,-4],[18,-16],[21,-29]]);
      line(ctx, '#ba9663', .8, [[12.5,6],[15.5,-4],[18.5,-16],[21.5,-28]]);
      polygon(ctx, '#465452', [[17,-27],[24,-28],[31,-35],[35,-30],[36,-24],[33,-15],[25,-19],[18,-20]]);
      polygon(ctx, '#81938b', [[17,-27],[24,-28],[31,-35],[30,-25],[24,-23],[18,-22]]);
      polygon(ctx, '#61766f', [[18,-22],[24,-23],[30,-25],[33,-15],[25,-19],[18,-20]]);
      polygon(ctx, '#b7c1ad', [[31,-35],[35,-30],[36,-24],[33,-15],[31,-20],[33,-26],[32,-30]]);
      polygon(ctx, '#96a799', [[24,-28],[31,-35],[29,-27],[25,-24]]);
      line(ctx, '#34453f', .8, [[24,-27],[26,-24],[23,-22],[26,-20]]);
      line(ctx, '#d2d4bd', .7, [[34,-29],[35,-24],[33,-18]]);
      for (let i = 0; i < 4; i++) line(ctx, i % 2 ? '#bfa77a' : '#8d7756', 1.6, [[16.5,-26+i*2.5],[24,-23+i*2.2]]);
      line(ctx, '#cbb586', 1, [[17,-27],[23,-16],[25,-14]]);
      oval(ctx, '#d2a07e', 13.5, 0.5, 2.8, 2.8);
      line(ctx, '#ccc3a5', 1.3, [[12,1],[15,2]]);
    },

    skeleton(ctx, steps) {
      const stride = Math.sin(steps) * 1.5;
      const sway = Math.sin(this._clock * 2.6) * 1.2;
      const flicker = Math.sin(this._clock * 7) * 0.5;
      polygon(ctx, '#2b2140', [[-10,-11],[10,-11],[15+sway*.6,5],[17+sway,16],[13,14],[11,17.5],[7,14.5],[3,16.5],[-1,14.5],[-5,17],[-9,14.5],[-12,17.5],[-14,14],[-17+sway,16],[-15+sway*.6,5]]);
      polygon(ctx, '#6d2940', [[-9,-9],[-13.5+sway*.6,5],[-15.5+sway,14.5],[-12.5,13.5],[-10,3]]);
      polygon(ctx, '#6d2940', [[9,-9],[13.5+sway*.6,5],[15.5+sway,14.5],[12.5,13.5],[10,3]]);
      line(ctx, '#c9a24f', 0.9, [[-10,-10],[-15+sway*.6,5],[-17+sway,16]]);
      line(ctx, '#c9a24f', 0.9, [[10,-10],[15+sway*.6,5],[17+sway,16]]);
      line(ctx, '#8f969a', 3.4, [[-9,9],[10,-17.5]]);
      line(ctx, '#c4cacb', 1.1, [[-8.6,8.2],[10.2,-17.4]]);
      line(ctx, '#8a6a36', 1.8, [[7.4,-20.4],[13,-15]]);
      line(ctx, '#3a2c22', 2.4, [[11,-19.4],[14.6,-24.4]]);
      line(ctx, '#6a5037', 0.8, [[11.8,-20.6],[13.6,-23.2]]);
      oval(ctx, '#d4ab58', 15.3, -25.3, 1.7, 1.7);
      for (const side of [-1, 1]) {
        const dx = side < 0 ? stride : -stride;
        const hip = [side * 3.6, 6], knee = [side * 4.6 + dx, 11.4], ankle = [side * 4.8 + dx, 16];
        line(ctx, '#5c5646', 3.4, [hip, knee, ankle]);
        line(ctx, '#ece3c8', 1.9, [hip, knee, ankle]);
        oval(ctx, '#e3d9bb', knee[0], knee[1], 1.9, 1.8);
        oval(ctx, '#5c5646', side * 5.6 + dx, 17.9, 4.2, 2.2);
        oval(ctx, '#e3d9bb', side * 5.6 + dx, 17.6, 3.5, 1.7);
      }
      polygon(ctx, '#5c5646', [[-8,3.4],[-6,9.6],[-1.6,8.8],[0,6.6],[1.6,8.8],[6,9.6],[8,3.4],[2,2.6],[0,3.6],[-2,2.6]]);
      polygon(ctx, '#e3d9bb', [[-7,4],[-5.4,8.8],[-1.8,8],[0,6],[1.8,8],[5.4,8.8],[7,4],[2,3.4],[0,4.4],[-2,3.4]]);
      oval(ctx, '#a99f82', -3.6, 6.2, 1.4, 0.9); oval(ctx, '#a99f82', 3.6, 6.2, 1.4, 0.9);
      oval(ctx, '#171a22', 0, -2.6, 7.2, 7.6);
      for (let y = -8; y <= 4; y += 2.4) oval(ctx, '#ddd3b4', 0, y, 1.5, 1);
      glow(ctx, 'rgba(126,240,196,.55)', 0, -2.4, 8);
      polygon(ctx, '#8ff0c8', [[0,-6.4+flicker],[2,-2.6],[1.2,0.2],[-1.2,0.2],[-2,-2.6]]);
      oval(ctx, '#e6fff4', 0, -1.4, 0.9, 1.2);
      for (let i = 0; i < 4; i++) {
        const y = -8.6 + i * 2.9;
        const reach = 7.6 - i * 0.5;
        for (const side of [-1, 1]) {
          for (const [color, width] of [['#5c5646', 2.6], ['#ece3c8', 1.5]]) {
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(side * 1.2, y); ctx.quadraticCurveTo(side * (reach + 1.4), y + 0.4, side * (reach - 2.4), y + 3); ctx.stroke();
          }
        }
      }
      line(ctx, '#e4dbc0', 2, [[0,-9.4],[0,-6.8]]);
      glow(ctx, 'rgba(126,240,196,.3)', 0, -3, 9);
      const arm = -stride * 0.5;
      for (const side of [-1, 1]) {
        const swing = side * arm;
        const shoulder = [side * 8.6, -8.4], elbow = [side * 11.6 + swing, -1.6], wrist = [side * 12.6 + swing * 1.4, 4.6];
        line(ctx, '#5c5646', 3.2, [shoulder, elbow, wrist]);
        line(ctx, '#ece3c8', 1.8, [shoulder, elbow, wrist]);
        oval(ctx, '#e3d9bb', elbow[0], elbow[1], 1.7, 1.7);
        oval(ctx, '#e3d9bb', wrist[0], wrist[1] + 1.2, 2.2, 1.9);
        for (const f of [-1.2, 0, 1.2]) line(ctx, '#d6cbab', 0.8, [[wrist[0] + f, wrist[1] + 2.4], [wrist[0] + f * 1.3, wrist[1] + 4.2]]);
      }
      for (const [x, y] of [[-9,-9.4],[-5.4,-10.4],[-1.6,-10.8],[2.4,-10.8],[6.2,-10.4],[9.6,-9.4]]) {
        oval(ctx, '#bdb5a6', x, y + 0.8, 3, 2.3);
        oval(ctx, '#ece8df', x, y, 2.8, 2.1);
      }
      for (const [x, y] of [[-8,-9.6],[-2.6,-10.6],[3.4,-10.4],[8.8,-9.6]]) line(ctx, '#27232e', 0.8, [[x, y - 0.6], [x, y + 0.6]]);
      oval(ctx, '#d4ab58', 0.4, -8.8, 1.8, 1.8);
      oval(ctx, '#c2414f', 0.4, -8.8, 0.8, 0.8);
      oval(ctx, '#d8ccaa', 0.5, -20.6, 10.2, 10.8);
      oval(ctx, '#efe6cb', -0.4, -21.6, 9.3, 9.8);
      oval(ctx, 'rgba(255,252,240,.55)', -4, -26.4, 3.2, 1.6, -0.5);
      polygon(ctx, '#d8ccaa', [[-6.4,-14.4],[7.4,-14.4],[6.4,-8.8],[-5.4,-8.8]]);
      polygon(ctx, '#ece3c8', [[-5.8,-14.4],[6.8,-14.4],[5.8,-10.2],[-4.8,-10.2]]);
      line(ctx, '#8e8468', 0.8, [[-5.4,-12],[6.4,-12]]);
      for (let x = -3.4; x <= 4.6; x += 2) line(ctx, '#8e8468', 0.7, [[x,-13.8],[x,-10.2]]);
      line(ctx, '#b3a684', 0.8, [[3.4,-30],[1.6,-26.4],[4.2,-25],[3,-22.4]]);
      glow(ctx, 'rgba(126,240,196,.32)', 0.6, -20.4, 12);
      oval(ctx, '#1c2226', -3.8, -20.6, 3.4, 3.6, 0.2);
      oval(ctx, '#1c2226', 5, -20.6, 3.5, 3.6, -0.2);
      oval(ctx, '#8ff0c8', -3.3, -20.4, 1.6, 1.7);
      oval(ctx, '#8ff0c8', 5.6, -20.4, 1.6, 1.7);
      oval(ctx, '#f2fff8', -3.7, -21.1, 0.6, 0.6);
      oval(ctx, '#f2fff8', 5.2, -21.1, 0.6, 0.6);
      polygon(ctx, '#3f4540', [[0.8,-17.8],[-0.8,-15],[0.8,-15.6],[2.4,-15]]);
      ctx.save();
      ctx.translate(0.6, -29.4);
      ctx.rotate(-0.2);
      polygon(ctx, '#a7803a', [[-6.4,1.6],[-7.2,-5],[-3.6,-2],[0,-7],[3.6,-2],[7.2,-5],[6.4,1.6]]);
      polygon(ctx, '#e0b95e', [[-6.4,1],[-6.8,-4.2],[-3.6,-1.2],[0,-6.2],[3.2,-1.4],[6.4,-4.2],[5.8,1]]);
      ctx.fillStyle = '#c29a48'; ctx.fillRect(-6.4, -0.6, 12.8, 2.2);
      oval(ctx, '#c2414f', 0, 0.5, 1, 0.9);
      oval(ctx, '#4d8fd1', -3.8, 0.5, 0.7, 0.7);
      oval(ctx, '#4d8fd1', 3.8, 0.5, 0.7, 0.7);
      oval(ctx, '#fff1c4', -6.8, -4.6, 0.7, 0.7);
      oval(ctx, '#fff1c4', 0, -6.6, 0.7, 0.7);
      oval(ctx, '#fff1c4', 6.8, -4.6, 0.7, 0.7);
      ctx.restore();
    },

    kraken(ctx, steps) {
      const drift = Math.sin(this._clock * 2.4);
      ctx.lineWidth = 3.4;
      for (let i = 0; i < 6; i++) {
        const x = -12 + i * 4.8;
        const swing = Math.sin(steps * 1.2 + i * 0.9) * 3 + drift;
        ctx.strokeStyle = i % 2 ? '#7a2e42' : '#8f3a4f';
        ctx.beginPath(); ctx.moveTo(x, 2); ctx.quadraticCurveTo(x + swing, 10, x - swing * 0.6 + (i < 3 ? -3 : 3), 18); ctx.stroke();
        oval(ctx, '#e7a8b2', x - swing * 0.3, 11, 0.9, 0.9);
      }
      polygon(ctx, '#7a2e42', [[-12,-8],[12,-8],[14,4],[-14,4]]);
      oval(ctx, '#8f3a4f', 0, -18, 11, 15);
      oval(ctx, '#a84b5f', -3, -22, 6, 9);
      for (const [x, y] of [[-6,-28],[5,-25],[-8,-16],[7,-14],[0,-31]]) oval(ctx, '#6a2638', x, y, 1.4, 1.4);
      glow(ctx, 'rgba(120,230,220,.26)', 1, -12, 12);
      for (const side of [-1, 1]) {
        oval(ctx, '#f0e6c8', side * 5, -12, 3.6, 3);
        oval(ctx, '#3ad2c4', side * 5, -12, 2, 2.1);
        oval(ctx, '#0f2328', side * 5, -12, 0.9, 1.6);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8f3a4f';
      ctx.beginPath(); ctx.moveTo(10, -6); ctx.quadraticCurveTo(22, -8 + Math.sin(steps) * 2, 20, -20); ctx.quadraticCurveTo(19, -26, 24, -28); ctx.stroke();
      oval(ctx, '#e7a8b2', 19, -14, 1, 1); oval(ctx, '#e7a8b2', 21, -21, 0.9, 0.9);
      ctx.strokeStyle = '#7a2e42';
      ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-20, -2, -18, 6); ctx.stroke();
    },

    yeti(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      const arm = -stride * 0.6;
      for (const side of [-1, 1]) {
        const dx = side < 0 ? stride : -stride;
        shag(ctx, '#bccbd8', side * 6 + dx, 11, 5.4, 6.2, 8, 0.24);
        oval(ctx, '#4f6378', side * 6.4 + dx, 17.4, 5.4, 2.4);
        for (const toe of [-2.4, 0, 2.4]) oval(ctx, '#e8f1f6', side * 6.4 + dx + toe, 18.6, 1, 0.8);
      }
      shag(ctx, '#aebfcd', 0.6, -3, 15.2, 14, 18, 0.13);
      shag(ctx, '#e6eef4', -0.4, -3.8, 14, 13, 18, 0.14);
      shag(ctx, '#f7fafc', -4, -8, 7, 5.6, 9, 0.16);
      for (const [x, y] of [[-7,1],[-2,5],[4,2],[7,-4],[-5,-4],[2,-7],[8,4]]) line(ctx, '#b4c4d2', 0.8, [[x - 1.4, y - 1.2], [x, y], [x + 1.4, y - 1.2]]);
      polygon(ctx, '#a9d6ee', [[-13.4,-10.6],[-12.4,-17],[-10.6,-10.8]]);
      polygon(ctx, '#e3f5ff', [[-12.9,-11],[-12.4,-16],[-11.8,-11]]);
      polygon(ctx, '#a9d6ee', [[-10.8,-11.2],[-8.6,-15.2],[-8.4,-10.8]]);
      for (const side of [-1, 1]) {
        const swing = side * arm;
        shag(ctx, side < 0 ? '#dbe5ee' : '#cfdbe6', side * 14.4 + swing * 0.5, -0.6, 4.6, 9.4, 10, 0.2, side * -0.26);
        const hx = side * 16.6 + swing, hy = 8;
        oval(ctx, '#4f6378', hx, hy, 3.8, 3.3);
        oval(ctx, '#6a8299', hx - side * 0.6, hy - 0.6, 2.8, 2.4);
        for (const claw of [-2, 0, 2]) polygon(ctx, '#eef5f9', [[hx + claw - 0.7, hy + 2.4], [hx + claw + 0.7, hy + 2.4], [hx + claw * 1.2, hy + 4.6]]);
      }
      for (const side of [-1, 1]) {
        polygon(ctx, '#a3c3d8', [[side * 5, -26], [side * 10.6, -29.4], [side * 12.6, -35], [side * 9.2, -31], [side * 4.4, -28.4]]);
        polygon(ctx, '#dcebf5', [[side * 5.4, -26.8], [side * 10.2, -29.8], [side * 12.6, -35], [side * 9.6, -30.4]]);
      }
      oval(ctx, '#b4c4d2', 1, -10.6, 8.6, 2.8);
      shag(ctx, '#e9f0f5', 0.5, -20, 11, 10.2, 14, 0.18);
      oval(ctx, '#5d7892', 0.8, -17.4, 7, 6.4);
      oval(ctx, '#7894ad', 0.6, -17.8, 6.3, 5.8);
      shag(ctx, '#eef4f8', 0.8, -23.2, 7.4, 2.8, 8, 0.36);
      polygon(ctx, '#526c85', [[-5,-19.6],[-0.6,-20.8],[0.8,-19.8],[2.2,-20.8],[6.6,-19.6],[6.2,-18.6],[0.8,-19.2],[-4.6,-18.6]]);
      for (const x of [-2, 3.8]) {
        oval(ctx, '#f2fbff', x, -17.6, 1.8, 1.5);
        oval(ctx, '#4fb4e0', x + 0.2, -17.5, 1, 1);
        oval(ctx, '#132230', x + 0.2, -17.5, 0.5, 0.5);
        oval(ctx, '#ffffff', x - 0.2, -17.9, 0.35, 0.35);
      }
      oval(ctx, '#95aec3', 0.9, -13.8, 4.4, 2.7);
      oval(ctx, '#2f3f50', 0.9, -15.4, 1.6, 1);
      polygon(ctx, '#2a3644', [[-2.4,-13],[4.2,-13],[3.2,-11.4],[-1.4,-11.4]]);
      polygon(ctx, '#f5fbff', [[-1.6,-11.6],[-0.8,-13.6],[0,-11.6]]);
      polygon(ctx, '#f5fbff', [[1.8,-11.6],[2.6,-13.6],[3.4,-11.6]]);
    },

    orc(ctx, steps) {
      const stride = Math.sin(steps) * 1.5;
      line(ctx, '#5b4027', 3.2, [[-11, 14], [14, -18]]);
      line(ctx, '#8d6740', 1.1, [[-10, 13], [13, -17]]);
      polygon(ctx, '#7f8a78', [[14, -18], [23, -25], [30, -17], [24, -10], [17, -13]]);
      polygon(ctx, '#c2cbb6', [[14, -18], [23, -25], [27, -19], [18, -14]]);
      line(ctx, '#5d6659', 0.9, [[20, -21], [22, -15]]);
      boots(ctx, stride, '#41372a', '#241d15');
      polygon(ctx, '#6d8c4c', [[-11,-9],[10,-9],[14,12],[-14,12]]);
      polygon(ctx, '#587340', [[3,-9],[10,-9],[14,12],[5,11]]);
      polygon(ctx, '#7d5433', [[-12,-8],[-3,-11],[0,5],[-10,7]]);
      line(ctx, '#a97846', 0.9, [[-11,-6],[-2,-8.6]]);
      line(ctx, '#a97846', 0.9, [[-10,0],[-1,-2]]);
      polygon(ctx, '#3f5230', [[-8,-9],[8,-9],[9,-2],[-9,-2]]);
      for (const x of [-6, -1, 4]) { oval(ctx, '#c9a862', x, -5.4, 1.2, 1.2); oval(ctx, '#f2d999', x, -5.8, 0.5, 0.5); }
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(-14, 3, 28, 4.4);
      ctx.fillStyle = '#c9a862'; ctx.fillRect(-2.6, 2.2, 6, 6);
      ctx.fillStyle = '#8a6a38'; ctx.fillRect(-1.4, 3.6, 3.6, 3.2);
      polygon(ctx, '#8e9470', [[-16,-10],[-5,-15],[0,-6],[-12,-1]]);
      polygon(ctx, '#b9c096', [[-16,-10],[-5,-15],[-2,-10],[-14,-6]]);
      line(ctx, '#6a7053', 0.9, [[-13,-8],[-4,-12]]);
      polygon(ctx, '#6d8c4c', [[-10,-6],[-18,3],[-13,8],[-6,-1]]);
      oval(ctx, '#7fa155', -16.5, 7.5, 3.6, 3.6);
      polygon(ctx, '#6d8c4c', [[8,-7],[16,-1],[13,4],[6,-1]]);
      oval(ctx, '#7fa155', 14.5, 3.5, 3.6, 3.4);
      oval(ctx, '#7fa155', 1, -18, 9.8, 9.2);
      oval(ctx, '#6b8c48', -4.6, -16.6, 4.6, 6.2);
      polygon(ctx, '#3f5230', [[-9,-21],[-4,-27],[4,-28],[10,-24],[9,-19],[3,-22],[-3,-21]]);
      line(ctx, '#63764a', 1.1, [[-6,-24],[0,-26],[6,-24]]);
      line(ctx, '#2c3a22', 1.6, [[-5,-20],[-1,-19]]);
      line(ctx, '#2c3a22', 1.6, [[5,-19],[9,-20]]);
      line(ctx, '#4e2f2f', 1.6, [[-7,-15],[-6,-9]]);
      line(ctx, '#4e2f2f', 1.6, [[-4,-15.4],[-3.4,-10]]);
      glow(ctx, 'rgba(246,214,110,.22)', 1.6, -17.6, 9);
      oval(ctx, '#f6d66e', -2.2, -17.6, 1.9, 1.5);
      oval(ctx, '#f6d66e', 5.8, -17.4, 1.9, 1.5);
      oval(ctx, '#2a1f17', -2.4, -17.8, 0.9, 0.9);
      oval(ctx, '#2a1f17', 5.6, -17.6, 0.9, 0.9);
      line(ctx, '#5d7340', 1, [[1,-14],[4.4,-14]]);
      line(ctx, '#41542f', 1.4, [[-4.4,-11.6],[7.4,-11.6]]);
      polygon(ctx, '#f7f1d8', [[-3.6,-12],[-1,-12],[-2.2,-17.4]]);
      polygon(ctx, '#f7f1d8', [[5,-12],[7.4,-12],[6.2,-16.6]]);
      polygon(ctx, '#d9d2b6', [[-3.6,-12],[-2.6,-12],[-2.2,-17.4]]);
      oval(ctx, '#c9a862', -9, -13, 1.3, 2);
      oval(ctx, '#f2d999', -9, -13.6, 0.5, 0.7);
    },

    frankenstein(ctx, steps) {
      const stride = Math.sin(steps) * 1.2;
      ctx.fillStyle = '#2f3138'; ctx.fillRect(-9 + stride, 6, 6, 11); ctx.fillRect(3 - stride, 6, 6, 11);
      ctx.fillStyle = '#20222a'; ctx.fillRect(-10 + stride, 14, 8, 6); ctx.fillRect(2 - stride, 14, 9, 6);
      line(ctx, '#4a4d56', 1, [[-9+stride,17],[-2+stride,17]]);
      line(ctx, '#4a4d56', 1, [[2-stride,17],[10-stride,17]]);
      polygon(ctx, '#2c3a3a', [[-11,-10],[10,-10],[13,11],[-13,11]]);
      polygon(ctx, '#222e2f', [[3,-10],[10,-10],[13,11],[5,10]]);
      polygon(ctx, '#6d8558', [[-4,-10],[3,-10],[3,2],[-4,2]]);
      line(ctx, '#3c5140', 0.8, [[-3,-7],[2,-7]]);
      line(ctx, '#3c5140', 0.8, [[-3,-3],[2,-3]]);
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-13,3,26,3);
      polygon(ctx, '#2c3a3a', [[-11,-8],[-19,0],[-15,5],[-7,-2]]);
      oval(ctx, '#7d9a62', -17, 5, 3.6, 3.4);
      polygon(ctx, '#2c3a3a', [[8,-8],[17,-2],[14,3],[6,-1]]);
      oval(ctx, '#7d9a62', 16, 1, 3.6, 3.4);
      line(ctx, '#55443a', 1, [[-17,3],[-14,7]]);
      oval(ctx, '#6d8a56', 1, -17, 8.8, 9.2);
      polygon(ctx, '#5c7548', [[-8,-19],[-8,-12],[-2,-9],[-4,-15]]);
      polygon(ctx, '#2a2420', [[-9,-21],[-9,-28],[10,-28],[10,-21],[6,-23],[0,-24],[-5,-22]]);
      line(ctx, '#3d3630', 1, [[-8,-26],[9,-26]]);
      ctx.fillStyle = '#9aa38c'; ctx.fillRect(-12,-13,4,4); ctx.fillRect(9,-13,4,4);
      oval(ctx, '#c6cdb6', -10, -11, 1.6, 1.6);
      oval(ctx, '#c6cdb6', 11, -11, 1.6, 1.6);
      line(ctx, '#2e3a2a', 1.4, [[-4,-20],[-1,-20]]);
      line(ctx, '#2e3a2a', 1.4, [[5,-20],[8,-20]]);
      oval(ctx, '#e6e2c4', -2, -18, 1.5, 1.2);
      oval(ctx, '#e6e2c4', 5.6, -18, 1.5, 1.2);
      oval(ctx, '#20262a', -2, -18, 0.8, 0.9);
      oval(ctx, '#20262a', 5.6, -18, 0.8, 0.9);
      line(ctx, '#4b5c3d', 1, [[1,-15],[4,-15]]);
      line(ctx, '#41522f', 1.2, [[-4,-12],[7,-12]]);
      for (const x of [-3, 0, 3, 6]) line(ctx, '#41522f', 0.8, [[x,-13.5],[x,-10.5]]);
      line(ctx, '#41522f', 0.9, [[6,-23],[9,-18]]);
      line(ctx, '#41522f', 0.9, [[7.4,-22.4],[6,-21]]);
    },

    invisible(ctx, steps) {
      const bob = Math.sin(steps) * 0.9;
      ctx.save();
      ctx.translate(0, bob);
      ctx.globalAlpha *= 0.13;
      polygon(ctx, '#cfe0dc', [[-9,-10],[9,-10],[12,11],[-12,11]]);
      polygon(ctx, '#cfe0dc', [[-9,-8],[-16,1],[-12,5],[-6,-2]]);
      polygon(ctx, '#cfe0dc', [[8,-8],[15,-2],[12,3],[5,-1]]);
      ctx.fillStyle = '#cfe0dc'; ctx.fillRect(-8,6,5,11); ctx.fillRect(3,6,5,11);
      oval(ctx, '#cfe0dc', 1, -17, 7.6, 8);
      ctx.restore();
      ctx.save();
      ctx.translate(0, bob);
      line(ctx, 'rgba(214,232,226,.28)', 1, [[-9,-10],[-12,11]]);
      line(ctx, 'rgba(214,232,226,.28)', 1, [[9,-10],[12,11]]);
      oval(ctx, 'rgba(226,240,235,.22)', 1, -17, 7.6, 8);
      polygon(ctx, '#2b2b33', [[-13,-21],[-8,-29],[9,-29],[13,-21],[8,-19],[-8,-19]]);
      polygon(ctx, '#3a3a45', [[-8,-29],[9,-29],[9,-22],[-8,-22]]);
      line(ctx, '#8d6f4a', 1.6, [[-8,-23],[9,-23]]);
      oval(ctx, '#1b1d22', -3, -17.6, 3.4, 3.2);
      oval(ctx, '#1b1d22', 6, -17.6, 3.4, 3.2);
      oval(ctx, '#4b5a66', -3.8, -18.4, 1.2, 1.1);
      oval(ctx, '#4b5a66', 5.2, -18.4, 1.2, 1.1);
      line(ctx, '#2b2b33', 1.2, [[0,-17.6],[3,-17.6]]);
      line(ctx, '#2b2b33', 1.2, [[-6.4,-18],[-9,-19]]);
      line(ctx, '#2b2b33', 1.2, [[9.4,-18],[12,-19]]);
      ctx.restore();
    },

    plague(ctx, steps) {
      const stride = Math.sin(steps) * 1.2;
      const sway = Math.sin(this._clock * 2.4) * 1.4;
      polygon(ctx, '#23262f', [[-10,-11],[-20+sway,16],[-9,13],[-2,18],[7,13],[19+sway,16],[10,-11]]);
      polygon(ctx, '#333744', [[-8,-10],[-14+sway,14],[-7,12],[-2,7],[4,15],[14+sway,14],[8,-10]]);
      line(ctx, '#6a6f82', 0.9, [[-9,-6],[-14+sway,13]]);
      line(ctx, '#6a6f82', 0.9, [[9,-4],[14+sway,13]]);
      boots(ctx, stride, '#1f2129', '#14151b');
      polygon(ctx, '#454a58', [[-8,-10],[8,-10],[11,11],[-11,11]]);
      polygon(ctx, '#e3ddc4', [[-4,-10],[4,-10],[3.4,-1],[-3.4,-1]]);
      for (let i = 0; i < 4; i++) { oval(ctx, '#cdd2bc', 0, -8.4 + i * 2.6, 1, 1); }
      ctx.fillStyle = '#4a4436'; ctx.fillRect(-11, 2, 22, 3.6);
      ctx.fillStyle = '#c0a868'; ctx.fillRect(-2.4, 1.2, 5.4, 5);
      polygon(ctx, '#7d8a6a', [[6,3],[10,3],[10,9],[6,9]]);
      oval(ctx, '#a9d89a', 8, 3, 2, 1.2);
      glow(ctx, 'rgba(169,216,154,.2)', 8, 6, 8);
      polygon(ctx, '#333744', [[-8,-8],[-15,1],[-11,5],[-5,-2]]);
      oval(ctx, '#2c2f39', -13.5, 5.5, 3.2, 3.2);
      polygon(ctx, '#333744', [[7,-8],[14,-2],[11,3],[4,-1]]);
      oval(ctx, '#2c2f39', 13.5, 2.5, 3.2, 3.2);
      oval(ctx, '#2a2d37', 1, -18, 8.4, 8.8);
      polygon(ctx, '#494e5c', [[-6,-25],[7,-25],[9,-14],[1,-9],[-6,-15]]);
      polygon(ctx, '#e8e2c6', [[-3,-21],[3,-20],[12,-12],[1,-13],[-3,-16]]);
      polygon(ctx, '#c4bda0', [[-3,-16],[1,-13],[12,-12],[3,-15]]);
      line(ctx, '#8f886f', 0.8, [[-1,-18],[9,-13]]);
      oval(ctx, '#1a1c22', -3.4, -21.4, 3.4, 3.2);
      oval(ctx, '#1a1c22', 5.4, -21.4, 3.4, 3.2);
      oval(ctx, '#b8724f', -3.4, -21.4, 2.4, 2.2);
      oval(ctx, '#b8724f', 5.4, -21.4, 2.4, 2.2);
      glow(ctx, 'rgba(226,120,88,.3)', 1, -21.4, 12);
      oval(ctx, '#e8875f', -3.4, -21.4, 1.5, 1.4);
      oval(ctx, '#e8875f', 5.4, -21.4, 1.5, 1.4);
      oval(ctx, '#ffe6d2', -4, -22, 0.7, 0.7);
      oval(ctx, '#ffe6d2', 4.8, -22, 0.7, 0.7);
      line(ctx, '#c0a868', 1.1, [[-6.8,-21.4],[-6.8,-21.4]]);
      line(ctx, '#c0a868', 1, [[-6.6,-23.4],[-0.4,-24]]);
      line(ctx, '#c0a868', 1, [[2.6,-24],[8.6,-23.4]]);
      polygon(ctx, '#181a22', [[-12,-24],[-10,-28],[10,-28],[13,-24],[9,-22],[-8,-22]]);
      polygon(ctx, '#272a34', [[-10,-28],[10,-28],[9,-32],[-8,-32]]);
      line(ctx, '#c0a868', 1.6, [[-9.6,-25.4],[10.4,-25.4]]);
      line(ctx, '#3c404d', 1, [[-8,-31],[9,-31]]);
    },

    cyborg(ctx, steps) {
      const t = this._clock;
      const stride = Math.sin(steps) * 1.5;
      ctx.fillStyle = '#2b333a'; ctx.fillRect(-8 + stride, 6, 5, 11);
      ctx.fillStyle = '#7e8a90'; ctx.fillRect(3 - stride, 6, 5, 11);
      ctx.fillStyle = '#1b2126'; ctx.fillRect(-9 + stride, 15, 7, 4);
      ctx.fillStyle = '#4c575d'; ctx.fillRect(2 - stride, 15, 8, 4);
      line(ctx, '#aab6bb', 0.8, [[3-stride,9],[7-stride,9]]);
      polygon(ctx, '#3f5b64', [[-10,-9],[9,-9],[12,11],[-12,11]]);
      polygon(ctx, '#8f9ca2', [[2,-9],[9,-9],[12,11],[4,10]]);
      line(ctx, '#c2ccd0', 0.8, [[5,-6],[10,-6]]);
      line(ctx, '#c2ccd0', 0.8, [[6,0],[11,0]]);
      polygon(ctx, '#2f4650', [[-10,-8],[-4,-9],[-3,3],[-9,4]]);
      ctx.fillStyle = '#42525a'; ctx.fillRect(-12,2,24,3);
      ctx.fillStyle = '#c9a862'; ctx.fillRect(-2,1.2,5,4.4);
      glow(ctx, 'rgba(126,232,214,.34)', -3, -3, 11);
      oval(ctx, '#1d2a2e', -3, -3, 3.4, 3.4);
      oval(ctx, '#7ee8d6', -3, -3, 1.9, 1.9);
      polygon(ctx, '#3f5b64', [[-10,-7],[-16,1],[-12,5],[-6,-2]]);
      oval(ctx, '#d2a07e', -14, 5, 3, 3);
      polygon(ctx, '#aab6bb', [[8,-8],[16,-3],[13,3],[5,-1]]);
      line(ctx, '#57646a', 0.9, [[10,-5],[13,-1]]);
      oval(ctx, '#8f9ca2', 15, 1, 3.4, 3.2);
      oval(ctx, '#d2a07e', 1, -17, 7.6, 8.2);
      polygon(ctx, '#aab6bb', [[1,-25],[9,-22],[9,-12],[1,-9]]);
      line(ctx, '#d6dee1', 0.9, [[3,-23],[8,-20]]);
      line(ctx, '#57646a', 0.9, [[2,-14],[8,-14]]);
      polygon(ctx, '#3c2a1e', [[-7,-16],[-8,-24],[-1,-28],[4,-26],[1,-23],[-3,-24],[-5,-15]]);
      ctx.fillStyle = '#231a15'; ctx.fillRect(-3,-18,2,2.4);
      const scan = Math.sin(t * 3.4) * 1.6;
      glow(ctx, 'rgba(255,106,85,.36)', 5.6, -18, 8);
      oval(ctx, '#ff6a55', 5.6, -18, 1.9, 1.9);
      oval(ctx, '#ffd8cc', 5.2, -18.4, 0.7, 0.7);
      line(ctx, 'rgba(255,106,85,.45)', 0.9, [[7.4,-18],[16+scan,-18]]);
      line(ctx, '#9b6a55', 1, [[-2,-12],[1,-12]]);
      line(ctx, '#57646a', 1, [[2,-11],[7,-11]]);
      oval(ctx, '#7ee8d6', 10.6, -21, 1.1, 1.1);
    },

    banana(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      const swing = Math.sin(steps) * 1.3;
      const ink = '#6e4a10';
      const limb = (x0, y0, cx, cy, x1, y1) => {
        ctx.strokeStyle = '#3f2a14'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      };
      const sneaker = x => {
        oval(ctx, '#efe8da', x + 0.5, 17.8, 3.9, 1.2);
        oval(ctx, '#d6413a', x, 16.5, 3.5, 2.1);
        oval(ctx, '#f39486', x - 1.1, 15.8, 1.3, 0.6);
        line(ctx, '#fff4ec', 0.5, [[x + 0.4, 15.3], [x + 1.8, 15.9]]);
      };
      const glove = (x, y) => {
        oval(ctx, '#cfc7b4', x + 0.3, y + 0.4, 2.3, 2.1);
        oval(ctx, '#fdfaf2', x, y, 2.2, 2);
        oval(ctx, '#fdfaf2', x - 1.6, y - 0.9, 0.9, 0.8);
      };
      const outline = () => {
        ctx.beginPath();
        ctx.moveTo(-1.4, -27.4);
        ctx.bezierCurveTo(7.8, -23.6, 14.6, -10.4, 11.4, 1.6);
        ctx.bezierCurveTo(9.8, 7.6, 5.8, 11.6, 1.6, 13);
        ctx.bezierCurveTo(-0.4, 11.2, 0.6, -2.4, -1.6, -13);
        ctx.bezierCurveTo(-2.6, -19.6, -4.2, -24.8, -4.6, -27.4);
        ctx.closePath();
      };
      limb(0.8, 9.6, -0.4 + stride * 0.4, 13, -1 + stride, 16);
      limb(4.6, 8.6, 5.6 - stride * 0.4, 12.6, 6.2 - stride, 16);
      sneaker(-1 + stride);
      sneaker(6.4 - stride);
      limb(-0.8, -4.6, -5.4, -4.2, -6.8, 1.2 - swing);
      glove(-7, 1.8 - swing);
      polygon(ctx, '#7d8a36', [[-4.6, -26.8], [-4.7, -30.6], [-5.5, -33.8], [-3.2, -34.4], [-2.5, -30.8], [-1.5, -26.8]]);
      polygon(ctx, '#a3b04c', [[-4.2, -27.2], [-4.4, -30.4], [-5, -33.4], [-4.1, -33.6], [-3.5, -30.6], [-3.1, -27.2]]);
      oval(ctx, '#4a3515', -4.3, -34.1, 1.4, 0.8);
      outline();
      ctx.fillStyle = radial(ctx, 1, -15, 27, [[0, '#fff08c'], [0.35, '#ffd83f'], [0.75, '#f5b62b'], [1, '#d88f17']]);
      ctx.fill();
      ctx.save();
      outline();
      ctx.clip();
      oval(ctx, 'rgba(205,128,18,.3)', 13.2, -1, 4.4, 15);
      oval(ctx, 'rgba(205,128,18,.22)', 4, 12.6, 6, 3.4);
      ctx.strokeStyle = 'rgba(206,140,26,.45)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-2.2, -25); ctx.bezierCurveTo(6.4, -19.4, 9.6, -6, 6.4, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,251,222,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3.3, -23); ctx.bezierCurveTo(-2.2, -17, -1.2, -10, -0.3, -3); ctx.stroke();
      for (const [x, y, r] of [[9.6, -3.2, 0.7], [7.4, 3.4, 0.55], [9.4, 1.2, 0.4], [5.2, 8.2, 0.5]]) oval(ctx, 'rgba(122,74,18,.55)', x, y, r, r * 0.8);
      ctx.restore();
      outline();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
      oval(ctx, '#5a3d17', 1.5, 12.5, 1.5, 1.1);
      for (const [x, y] of [[2.6, -13.4], [7.3, -13.6]]) {
        oval(ctx, ink, x, y, 2.3, 2.7);
        oval(ctx, '#fffdf7', x, y, 1.8, 2.2);
        oval(ctx, '#2b1a0c', x + 0.45, y + 0.3, 1.15, 1.5);
        oval(ctx, '#ffffff', x, y - 0.45, 0.5, 0.55);
        oval(ctx, 'rgba(255,255,255,.8)', x + 0.9, y + 0.95, 0.25, 0.25);
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(1.2, -16.9); ctx.quadraticCurveTo(2.6, -17.9, 3.9, -17.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -17.2); ctx.quadraticCurveTo(7.4, -18.1, 8.6, -17.2); ctx.stroke();
      oval(ctx, 'rgba(244,128,96,.5)', 0.9, -10.2, 1.5, 0.9);
      oval(ctx, 'rgba(244,128,96,.5)', 9.5, -10.4, 1.5, 0.9);
      ctx.fillStyle = '#6a2a12';
      ctx.beginPath(); ctx.moveTo(3.2, -10.3); ctx.quadraticCurveTo(5.2, -10.9, 7.2, -10.4); ctx.quadraticCurveTo(6.8, -6.9, 5.2, -6.8); ctx.quadraticCurveTo(3.6, -6.9, 3.2, -10.3); ctx.fill();
      oval(ctx, '#f07c7c', 5.3, -7.6, 1.3, 0.75);
      limb(10.4, -3.4, 13.8, -3.6, 14.4, 1.6 + swing);
      glove(14.6, 2.2 + swing);
    },

    penguin(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      const flap = Math.sin(steps) * 0.22;
      const flutter = Math.sin(steps * 2) * 0.8;
      const foot = x => {
        polygon(ctx, '#cf6c19', [[x - 4.2, 17.8], [x + 4.8, 17.8], [x + 3.4, 15.2], [x - 2.8, 15]]);
        for (const toe of [-2.6, 0.5, 3.5]) oval(ctx, '#f59a31', x + toe, 17.1, 1.7, 1.2);
      };
      const flipper = (x, angle, color) => {
        ctx.save();
        ctx.translate(x, -9.4);
        ctx.rotate(angle);
        oval(ctx, '#0a0e15', 0, 7, 3.6, 8.8);
        oval(ctx, color, -0.2, 6.8, 3, 8.2);
        oval(ctx, 'rgba(255,255,255,.1)', -1, 4.6, 0.9, 4.2);
        ctx.restore();
      };
      foot(-4 + stride);
      foot(5.2 - stride);
      flipper(-9.8, 0.42 + flap, '#161d2a');
      oval(ctx, '#0a0e15', 0.6, -4.6, 13.2, 19.6);
      oval(ctx, radial(ctx, -4, -15, 24, [[0, '#46597a'], [0.4, '#243047'], [1, '#101521']]), 0.6, -4.6, 12.4, 18.8);
      oval(ctx, 'rgba(255,255,255,.16)', -5, -17.4, 3.4, 1.7, -0.7);
      oval(ctx, radial(ctx, 1.4, -3, 14, [[0, '#ffffff'], [0.65, '#f1f4f8'], [1, '#d2dce6']]), 2.9, 0.8, 8.8, 13.2);
      for (const [x, y, rx, ry] of [[1.6, -15.4, 4.1, 4.7], [6.9, -15.6, 4.1, 4.7], [4.3, -11.4, 5.4, 4.2]]) oval(ctx, '#f7f9fb', x, y, rx, ry);
      for (const x of [2, 6.9]) {
        oval(ctx, '#0b0f16', x, -15.8, 1.75, 2.15);
        oval(ctx, '#ffffff', x - 0.5, -16.5, 0.65, 0.72);
        oval(ctx, 'rgba(255,255,255,.85)', x + 0.6, -15, 0.3, 0.3);
      }
      oval(ctx, 'rgba(248,140,158,.55)', -0.2, -12.6, 1.4, 0.85);
      oval(ctx, 'rgba(248,140,158,.55)', 9.6, -13.2, 1.3, 0.8);
      polygon(ctx, '#f8a93a', [[3.2, -12.8], [6.2, -13.6], [11, -11.8], [6.4, -10.9]]);
      polygon(ctx, '#dc7619', [[3.6, -11.6], [6.4, -10.9], [9.6, -11], [6, -9.6]]);
      line(ctx, '#ffd896', 0.5, [[4.6, -12.9], [7.8, -12.4]]);
      ctx.fillStyle = '#c93833';
      ctx.beginPath(); ctx.moveTo(-11.2, -9.6); ctx.quadraticCurveTo(0.8, -5.4, 12.6, -9.8); ctx.lineTo(12.8, -6.2); ctx.quadraticCurveTo(0.8, -1.6, -11.4, -5.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8f2522'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-11.2, -5.9); ctx.quadraticCurveTo(0.8, -1.7, 12.7, -6.3); ctx.stroke();
      for (const x of [-8, -4, 0, 4, 8]) line(ctx, '#e3564c', 0.6, [[x, -8.4 + Math.abs(x) * 0.12], [x + 0.3, -5.2 + Math.abs(x) * 0.14]]);
      polygon(ctx, '#c93833', [[-8.8, -7.4], [-4.8, -6.6], [-6.2 + flutter * 0.3, 3.8], [-10.4 + flutter, 2.8]]);
      line(ctx, '#f4e7d7', 1, [[-8.9 + flutter * 0.4, -2.4], [-5.8 + flutter * 0.1, -1.8]]);
      line(ctx, '#f4e7d7', 1, [[-9.4 + flutter * 0.6, 0.4], [-6 + flutter * 0.2, 1]]);
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const x = -10.4 + flutter + (4.2 - flutter * 0.7) * t;
        const y = 2.8 + t;
        line(ctx, '#e8574d', 0.6, [[x, y], [x - 0.3 + flutter * 0.2, y + 1.8]]);
      }
      flipper(11, -0.42 - flap, '#1c2433');
    },

    sheriff(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      const swing = Math.sin(steps) * 1.2;
      boots(ctx, stride, '#3e5163', '#5b3a22');
      oval(ctx, '#cfc7ae', -9.6 + stride, 18.2, 1.3, 1.3);
      oval(ctx, '#cfc7ae', 10.4 - stride, 18.2, 1.3, 1.3);
      polygon(ctx, '#b99d74', [[-8, -8], [-12.4, 1.6 - swing], [-9.6, 3.2 - swing], [-5.4, -4.6]]);
      oval(ctx, '#d7a37b', -11.2, 3.6 - swing, 2.3, 2.3);
      polygon(ctx, '#cbb58d', [[-8.4, -10], [8.4, -10], [9.2, 8], [-9.2, 8]]);
      polygon(ctx, '#6d4a2d', [[-8.8, -9.8], [-2.4, -9.2], [-1.2, 7.8], [-9.6, 7.8]]);
      polygon(ctx, '#6d4a2d', [[8.8, -9.8], [2.8, -9.2], [1.6, 7.8], [9.6, 7.8]]);
      line(ctx, '#8f6a45', 0.8, [[-7.8, -7.4], [-8.2, 6.4]]);
      star(ctx, '#e2b64d', 5.4, -3.4, 3.4);
      oval(ctx, '#fff1b8', 5.4, -3.4, 0.8, 0.8);
      ctx.fillStyle = '#3b281a'; ctx.fillRect(-9.6, 6.2, 19.2, 3.2);
      ctx.fillStyle = '#d8b35e'; ctx.fillRect(-1.8, 6, 3.6, 3.6);
      polygon(ctx, '#4a3220', [[7.2, 8.4], [11.8, 8.4], [11.2, 15.4], [7.8, 15.4]]);
      polygon(ctx, '#6a6f78', [[8.2, 8.6], [10.8, 8.6], [11.6, 5.4], [8.8, 5]]);
      polygon(ctx, '#ab3b31', [[-6.2, -11], [7.4, -11], [3.2, -6.4], [0.6, -4.2], [-2, -6.4]]);
      polygon(ctx, '#b99d74', [[6, -8], [12.6, -1.4 + swing], [10.4, 1.6 + swing], [5, -4.2]]);
      oval(ctx, '#d7a37b', 12, 1.2 + swing, 2.3, 2.3);
      oval(ctx, '#d7a37b', 1, -17, 7.4, 7.8);
      oval(ctx, '#c28d67', -4.8, -16.4, 1.8, 2.8);
      oval(ctx, '#2a1d14', 2, -18.4, 0.9, 1.1);
      oval(ctx, '#2a1d14', 5.8, -18.4, 0.9, 1.1);
      line(ctx, '#5a3a22', 1, [[0.6, -20.4], [3, -20.8]]);
      line(ctx, '#5a3a22', 1, [[4.8, -20.8], [7.2, -20.4]]);
      oval(ctx, '#c28d67', 7.8, -15.6, 1.6, 1.4);
      polygon(ctx, '#5a3a22', [[0.4, -13.6], [3.6, -14.6], [7.4, -14], [10, -11.4], [7.6, -12.4], [3.8, -12.6], [0.8, -11.6], [-1, -12.8]]);
      polygon(ctx, '#6a4526', [[-7.4, -22], [-6.8, -30], [-3.4, -33], [0, -31.4], [3.6, -33], [7, -30], [7.8, -22]]);
      polygon(ctx, '#86592f', [[-6.8, -30], [-3.4, -33], [0, -31.4], [-1, -23], [-7.2, -22.6]]);
      ctx.fillStyle = '#2f1f13'; ctx.fillRect(-7.4, -24.8, 15.2, 2.4);
      polygon(ctx, '#5a3b20', [[-15, -24.4], [-10.6, -20.8], [0, -19.6], [10.6, -20.8], [15.6, -24.4], [11.8, -22.6], [0, -21.4], [-11, -22.6]]);
      polygon(ctx, '#8f6236', [[-15, -24.4], [-11, -22.6], [0, -21.4], [11.8, -22.6], [15.6, -24.4], [12.6, -25], [0, -23.2], [-12, -25]]);
    },

    darkmouse(ctx, steps) {
      const stride = Math.sin(steps) * 2;
      const swing = Math.sin(steps) * 1.8;
      const ink = '#101010', paper = '#f1ede2';
      const hose = (x0, y0, cx, cy, x1, y1, width = 1.9) => {
        ctx.strokeStyle = ink; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      };
      const shoe = x => {
        oval(ctx, '#161616', x - 2.4, 16.8, 2.7, 2.4);
        oval(ctx, '#161616', x + 1.4, 16.4, 5.8, 3.1);
        oval(ctx, 'rgba(255,255,255,.24)', x + 2.6, 15, 2.6, 0.9);
        line(ctx, '#4a4a4a', 0.7, [[x - 4.4, 18.3], [x + 6.6, 18.3]]);
      };
      const hand = (x, y) => {
        oval(ctx, ink, x, y, 2.3, 2.1);
        oval(ctx, ink, x - 1.5, y - 1.3, 0.9, 0.8);
        oval(ctx, 'rgba(255,255,255,.14)', x - 0.6, y - 0.7, 0.8, 0.5);
      };
      ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-5, 4.4); ctx.bezierCurveTo(-13, 2.6, -17.8, 9.6 + swing * 0.3, -14.4, 14); ctx.bezierCurveTo(-12.4, 16.4, -9.2, 15.2, -9.8, 12.6); ctx.stroke();
      hose(-3.4, 8, -3.8 + stride * 0.4, 11.8, -4 + stride, 15);
      hose(3.4, 8, 3.8 - stride * 0.4, 11.8, 4 - stride, 15);
      shoe(-4.8 + stride);
      shoe(4.6 - stride);
      hose(-4.2, -6, -9.4, -4.6, -10.4, 1.6 - swing);
      hand(-10.6, 2.4 - swing);
      oval(ctx, ink, 0, -3.4, 6.2, 7.2);
      oval(ctx, ink, 0, 1.8, 6.9, 5.4);
      ctx.fillStyle = radial(ctx, -2.4, 1.2, 11, [[0, '#858585'], [1, '#434343']]);
      ctx.beginPath(); ctx.moveTo(-6.9, 0); ctx.lineTo(6.9, 0); ctx.quadraticCurveTo(8.8, 4.4, 7.8, 8.3); ctx.quadraticCurveTo(4.4, 9.4, 1.2, 8.3); ctx.lineTo(0, 6.2); ctx.lineTo(-1.2, 8.3); ctx.quadraticCurveTo(-4.4, 9.4, -7.8, 8.3); ctx.quadraticCurveTo(-8.8, 4.4, -6.9, 0); ctx.closePath(); ctx.fill();
      line(ctx, '#2c2c2c', 0.8, [[-6.8, 0.6], [6.8, 0.6]]);
      for (const x of [-2.5, 2.6]) {
        oval(ctx, paper, x, 3.4, 1.3, 1.55);
        oval(ctx, '#a19c90', x - 0.35, 3.3, 0.28, 0.28);
        oval(ctx, '#a19c90', x + 0.35, 3.3, 0.28, 0.28);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(0, -3.4, 5.2, 3.5, 4.5); ctx.stroke();
      hose(4, -6, 9.2, -5, 10.6, 1.4 + swing);
      hand(10.8, 2 + swing);
      for (const [x, y] of [[-7.2, -27.6], [7.8, -28.4]]) {
        oval(ctx, ink, x, y, 5.9, 5.9);
        ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x, y, 4.6, 3.6, 4.6); ctx.stroke();
      }
      oval(ctx, ink, 0.8, -17.8, 8.2, 8);
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(0.8, -17.8, 6.6, 3.5, 4.4); ctx.stroke();
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.moveTo(-3.2, -14.6);
      ctx.bezierCurveTo(-4.2, -19.4, -1.8, -23.8, 1.4, -23.4);
      ctx.quadraticCurveTo(2.8, -22.8, 3.4, -21.2);
      ctx.quadraticCurveTo(4.2, -23.4, 6, -23.4);
      ctx.bezierCurveTo(8.6, -23.2, 9.4, -20.2, 10.2, -18.8);
      ctx.bezierCurveTo(12.4, -18.4, 14.8, -17.6, 14.6, -15.4);
      ctx.bezierCurveTo(14.4, -12.8, 11.6, -12, 8.6, -11.4);
      ctx.bezierCurveTo(5.4, -10.2, 0.6, -10.2, -1.6, -11.6);
      ctx.quadraticCurveTo(-3, -12.6, -3.2, -14.6);
      ctx.fill();
      for (const [x, y] of [[1.6, -19.2], [5.2, -19.4]]) {
        oval(ctx, ink, x, y, 1.3, 2.7);
        polygon(ctx, paper, [[x + 0.2, y - 1.7], [x + 1.4, y - 0.8], [x + 0.5, y - 0.3]]);
      }
      oval(ctx, ink, 14.1, -16.4, 2.3, 1.8);
      oval(ctx, '#8d8d8d', 13.5, -17, 0.7, 0.4);
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.moveTo(6.2, -13.8); ctx.quadraticCurveTo(9.6, -10.4, 12.6, -13); ctx.quadraticCurveTo(9.6, -12.3, 6.2, -13.8); ctx.fill();
      oval(ctx, '#8d8d8d', 9.6, -11.7, 1.3, 0.55);
      hose(5.4, -14.6, 9.4, -10.6, 13, -13.3, 0.9);
      line(ctx, ink, 0.7, [[4.9, -15.1], [5.5, -14.2]]);
    },

    soldier(ctx, steps) {
      const stride = Math.sin(steps) * 1.6;
      const swing = Math.sin(steps) * 1.2;
      boots(ctx, stride, '#4d5a33', '#24211c');
      polygon(ctx, '#56663a', [[-8, -8], [-12.4, 1.6 - swing], [-9.6, 3.4 - swing], [-5.4, -4.4]]);
      oval(ctx, '#c99a74', -11.2, 3.8 - swing, 2.3, 2.3);
      polygon(ctx, '#5b6b3b', [[-8.6, -10], [8.6, -10], [9.4, 8], [-9.4, 8]]);
      for (const [x, y, rx, ry, color] of [[-5, -5, 2.6, 1.6, '#3f4b27'], [4, -7, 2.2, 1.4, '#7a8a4c'], [-2, 2, 2.8, 1.6, '#7a8a4c'], [5, 3, 2.4, 1.6, '#3f4b27'], [-6.4, 5, 1.8, 1.2, '#3f4b27']]) oval(ctx, color, x, y, rx, ry);
      line(ctx, '#3a2f22', 2.2, [[-8, -9], [7.6, 6]]);
      polygon(ctx, '#4a5530', [[-9.4, 2], [-4.6, 2], [-4.6, 7.4], [-9.4, 7.4]]);
      ctx.fillStyle = '#2f2a20'; ctx.fillRect(-9.6, 6.2, 19.2, 3);
      ctx.fillStyle = '#9ea08a'; ctx.fillRect(-1.6, 6, 3.2, 3.4);
      line(ctx, '#c9ccd2', 0.7, [[-1.4, -10], [0.4, -6], [2.2, -10]]);
      oval(ctx, '#c9ccd2', 0.4, -5.4, 1, 1.3);
      polygon(ctx, '#56663a', [[6, -8], [12.6, -1.2 + swing], [10.4, 1.8 + swing], [5, -4]]);
      oval(ctx, '#c99a74', 12, 1.4 + swing, 2.3, 2.3);
      oval(ctx, '#c99a74', 1, -17, 7.2, 7.6);
      oval(ctx, '#2a1d14', 2.4, -17.6, 0.9, 1.1);
      oval(ctx, '#2a1d14', 6, -17.6, 0.9, 1.1);
      line(ctx, '#3a2a1c', 1, [[1.2, -19.6], [3.4, -19.8]]);
      line(ctx, '#3a2a1c', 1, [[5, -19.8], [7.2, -19.4]]);
      line(ctx, '#9b6a4e', 0.9, [[3.4, -13.2], [6.4, -13.4]]);
      line(ctx, '#3a4424', 0.8, [[-5.4, -18], [-3, -12.6], [2, -11.4]]);
      polygon(ctx, '#4e5d2e', [[-8.6, -19.4], [-8, -24.6], [-4.4, -28.6], [1.4, -29.8], [6.8, -28.2], [9.6, -24], [10.2, -19.4]]);
      polygon(ctx, '#63733c', [[-7, -24.2], [-3.8, -27.8], [1.4, -28.8], [-0.4, -24], [-6.4, -21.4]]);
      polygon(ctx, '#3f4b25', [[-9.8, -19.8], [11.2, -19.8], [10.8, -18], [-9.6, -18]]);
      line(ctx, '#39441f', 0.7, [[-6, -26], [8, -22]]);
      line(ctx, '#39441f', 0.7, [[-7, -22.4], [7, -27]]);
    },

    vespermobile(ctx, steps) {
      const turn = steps * 1.2;
      const flick = Math.sin(turn * 3) * 1.5;
      const fin = (dx, dy, fill) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(-9.6 + dx, -4.3);
        ctx.quadraticCurveTo(-17.4 + dx, -6 + dy, -27.4 + dx, -17.4 + dy);
        ctx.quadraticCurveTo(-25.4 + dx, -13.6 + dy, -26.8 + dx, -10.8 + dy);
        ctx.quadraticCurveTo(-24 + dx, -10.2 + dy, -25.2 + dx, -7.2 + dy);
        ctx.quadraticCurveTo(-22.8 + dx, -6.6 + dy, -23.4 + dx, -3.2);
        ctx.closePath();
        ctx.fill();
      };
      ctx.save();
      ctx.translate(0, 3 - Math.abs(Math.sin(steps * 2)) * 0.6);
      fin(3.6, -1.4, '#07080a');
      polygon(ctx, 'rgba(255,120,40,.75)', [[-26.2, 2.6], [-31.8 - flick, 3.8], [-26.2, 5]]);
      polygon(ctx, 'rgba(255,232,170,.9)', [[-26, 3.2], [-29.2 - flick * 0.6, 3.8], [-26, 4.4]]);
      const paint = radial(ctx, 0, -15, 27, [[0, '#4a5160'], [0.42, '#1f232b'], [1, '#08090c']]);
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.moveTo(-24.6, 6.8);
      ctx.lineTo(-25.6, 1.2);
      ctx.quadraticCurveTo(-24.2, -2.6, -18.6, -3.2);
      ctx.lineTo(-9.4, -4.4);
      ctx.lineTo(10.4, -5);
      ctx.lineTo(20.6, -3.4);
      ctx.quadraticCurveTo(26.4, -2.2, 27.2, 1.8);
      ctx.quadraticCurveTo(26.6, 5.6, 22.8, 7);
      ctx.closePath();
      ctx.fill();
      fin(0, 0, paint);
      ctx.strokeStyle = 'rgba(165,176,200,.55)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-10.4, -4.4); ctx.quadraticCurveTo(-17.4, -6.1, -27, -17); ctx.stroke();
      ctx.fillStyle = radial(ctx, 0, -10, 11, [[0, '#35546a'], [0.6, '#15232e'], [1, '#0a1117']]);
      ctx.beginPath(); ctx.moveTo(-7.6, -4.5); ctx.quadraticCurveTo(-4, -11.2, 1.8, -11.4); ctx.quadraticCurveTo(7.2, -11, 9.8, -4.9); ctx.closePath(); ctx.fill();
      polygon(ctx, 'rgba(185,222,242,.3)', [[-3.4, -9.8], [0.8, -10.7], [-2.6, -5.2], [-5.2, -5]]);
      polygon(ctx, 'rgba(185,222,242,.18)', [[2.2, -10.6], [3.6, -10.5], [0.8, -5], [-0.4, -5]]);
      ctx.strokeStyle = '#3d4350'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-7.6, -4.5); ctx.quadraticCurveTo(-4, -11.2, 1.8, -11.4); ctx.quadraticCurveTo(7.2, -11, 9.8, -4.9); ctx.stroke();
      line(ctx, 'rgba(165,176,200,.5)', 0.7, [[-23.8, -1.6], [-18.6, -2.9], [-9.4, -4]]);
      line(ctx, 'rgba(165,176,200,.5)', 0.7, [[10.6, -4.6], [20.4, -3], [25.4, -1.2]]);
      line(ctx, 'rgba(214,176,92,.85)', 0.6, [[-23.2, 2.4], [24.6, 2]]);
      line(ctx, '#2a2e37', 0.6, [[-5.6, -3.8], [-5.2, 5.6]]);
      line(ctx, '#2a2e37', 0.6, [[8.6, -4.4], [8.2, 5.4]]);
      polygon(ctx, '#e3bf66', [[0, -2], [1.4, 1.3], [2.8, -2], [2.1, -2], [1.4, -0.3], [0.7, -2]]);
      glow(ctx, 'rgba(255,196,110,.5)', 26, 0, 7);
      polygon(ctx, '#fff2cf', [[22, -1.6], [26.4, -0.5], [25.8, 0.6], [21.8, -0.4]]);
      glow(ctx, 'rgba(255,60,60,.4)', -24.8, 0.3, 3.4);
      polygon(ctx, '#e0303a', [[-25.4, -0.5], [-23.4, -0.9], [-23.4, 0.7], [-25.3, 1.1]]);
      oval(ctx, '#15171c', -25.8, 3.8, 1.6, 1.7);
      oval(ctx, '#ff9a3c', -25.9, 3.8, 0.9, 1);
      for (const x of [-13, 14]) {
        ctx.fillStyle = '#040405'; ctx.beginPath(); ctx.ellipse(x, 7, 7, 5.6, 0, Math.PI, TAU); ctx.fill();
        oval(ctx, '#0b0b0d', x, 8.6, 5.8, 5.8);
        oval(ctx, '#23262d', x, 8.6, 4.3, 4.3);
        oval(ctx, radial(ctx, x - 1.2, 7.2, 5.4, [[0, '#9aa1ae'], [1, '#3a3f49']]), x, 8.6, 3.7, 3.7);
        ctx.strokeStyle = '#16181d'; ctx.lineWidth = 1.1;
        for (let i = 0; i < 5; i++) {
          const angle = turn + i * TAU / 5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 1.2, 8.6 + Math.sin(angle) * 1.2); ctx.lineTo(x + Math.cos(angle + 0.35) * 3.5, 8.6 + Math.sin(angle + 0.35) * 3.5); ctx.stroke();
        }
        oval(ctx, '#d4ae57', x, 8.6, 1.1, 1.1);
        ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x, 8.6, 5.1, 3.6, 4.9); ctx.stroke();
      }
      ctx.restore();
    }
  };

  const HAT_SPOTS = {
    human: [0.6, -25.8, 1], ghost: [0.4, -24.8, 1], hooded: [0.6, -28, 1.02], vampire: [1, -29.2, 1],
    mummy: [1, -26.5, 1], zombie: [1, -26.2, 1], jack: [0.6, -28.4, 1.08], kraken: [0.4, -31.4, 1.1],
    yeti: [0.6, -28.4, 1.08], survivor: [1, -27.8, 1], alien: [0.4, -28, 1.04], spider: [13, -10.5, 0.7],
    skeleton: [0.4, -30.2, 1.06], orc: [1, -26.4, 1.04], invisible: [0.6, -21, 1.06], cyborg: [1, -27, 1],
    plague: [1, -24, 1.1], frankenstein: [1, -26.4, 1.04], banana: [-1.6, -26.8, 0.8], penguin: [1.2, -22, 1],
    sheriff: [1, -22.6, 1.08], darkmouse: [0.8, -25, 0.96], soldier: [1, -27.4, 1.04], vespermobile: [1.4, -5.8, 0.78]
  };

  function drawHat(ctx) {
    oval(ctx, 'rgba(0,0,0,.2)', 0, 1.4, 11.6, 2.4);
    polygon(ctx, '#5e3a1b', [[-16, -3.4], [-12, 0.8], [-6, 2.2], [0, 2.6], [6, 2.2], [12, 0.8], [16, -3.4], [12.6, -0.4], [6, 0.6], [0, 0.8], [-6, 0.6], [-12.6, -0.4]]);
    polygon(ctx, '#9c6832', [[-7.6, -0.6], [-7.2, -8.6], [-4.8, -11.8], [-1.6, -10.2], [0, -11], [1.6, -10.2], [4.8, -11.8], [7.2, -8.6], [7.6, -0.6]]);
    polygon(ctx, '#b67c3f', [[-7.2, -8.6], [-4.8, -11.8], [-1.6, -10.2], [-2.4, -2], [-7.4, -1.6]]);
    line(ctx, '#6d4520', 0.9, [[0, -10.6], [0, -6.6]]);
    polygon(ctx, '#3b2414', [[-7.5, -4.4], [7.5, -4.4], [7.6, -1.6], [-7.6, -1.6]]);
    ctx.fillStyle = '#d9b25a'; ctx.fillRect(3.4, -3.9, 2.4, 1.8);
    polygon(ctx, '#8b5a2b', [[-16, -3.4], [-12.6, -0.4], [-6, 0.6], [0, 0.8], [6, 0.6], [12.6, -0.4], [16, -3.4], [13.4, -3.8], [7, -1.6], [0, -1.2], [-7, -1.6], [-13.4, -3.8]]);
    line(ctx, '#c08a4a', 0.7, [[-13, -3], [-7, -0.8], [0, -0.4]]);
  }

  function drawCap(ctx) {
    ctx.rotate(-0.22);
    oval(ctx, 'rgba(0,0,0,.2)', 0, 1, 9, 2);
    ctx.fillStyle = '#2d5fb4';
    ctx.beginPath(); ctx.moveTo(-8.4, 0.6); ctx.quadraticCurveTo(-8, -10, 0.4, -10.4); ctx.quadraticCurveTo(8.6, -10, 8.8, 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a7fd6';
    ctx.beginPath(); ctx.moveTo(-6.4, -0.4); ctx.quadraticCurveTo(-6, -8.6, 0.4, -9.4); ctx.quadraticCurveTo(-1.6, -4, -2.2, -0.4); ctx.closePath(); ctx.fill();
    line(ctx, '#1f4588', 0.7, [[0.4, -10.2], [0.8, 0.4]]);
    oval(ctx, '#1f4588', 0.4, -10.2, 1.3, 0.8);
    polygon(ctx, '#23509c', [[4, -0.4], [15.6, -1.4], [16.4, 1], [4.2, 1.8]]);
    polygon(ctx, '#3567c0', [[4, -0.4], [15.6, -1.4], [15.8, -0.4], [4.4, 0.6]]);
    ctx.fillStyle = '#1b3f7c'; ctx.fillRect(-8.6, -0.8, 13, 1.8);
  }

  function drawCrown(ctx) {
    oval(ctx, 'rgba(0,0,0,.2)', 0, 1.2, 8.4, 1.8);
    polygon(ctx, '#a57a2c', [[-8, 1], [-8.6, -8], [-4.4, -4], [0, -10.4], [4.4, -4], [8.6, -8], [8, 1]]);
    polygon(ctx, '#e3bb57', [[-7.2, 0.4], [-7.6, -6.6], [-4.2, -3], [0, -9.2], [4.2, -3], [7.6, -6.6], [7.2, 0.4]]);
    ctx.fillStyle = '#c99a3c'; ctx.fillRect(-7.6, -2.2, 15.2, 3);
    oval(ctx, '#c2414f', 0, -0.7, 1.3, 1.1);
    oval(ctx, '#3f7fd0', -4.4, -0.7, 0.9, 0.9);
    oval(ctx, '#3f7fd0', 4.4, -0.7, 0.9, 0.9);
    for (const [x, y] of [[-8.6, -8], [0, -10.4], [8.6, -8]]) oval(ctx, '#fff3c6', x, y, 1.1, 1.1);
    line(ctx, '#fff0bf', 0.6, [[-6.4, -1.8], [-1.6, -1.8]]);
  }

  const HEADWEAR = { hat: drawHat, cap: drawCap, crown: drawCrown };

  VesperGame.prototype._drawHeadwear = function (ctx, id, accessories) {
    const piece = accessories.find(item => HEADWEAR[item]);
    if (!piece) return;
    const [x, y, size] = HAT_SPOTS[id] || [1, -27, 1];
    ctx.save();
    ctx.translate(x, y);
    if (piece === 'hat') ctx.rotate(-0.08);
    ctx.scale(size, size);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    HEADWEAR[piece](ctx);
    ctx.restore();
  };

  function drawCoins(ctx, amount) {
    const count = Math.max(1, Math.min(4, Math.round(amount / 10)));
    ctx.translate(0, (count - 1) * 2.7 - 5);
    for (let i = 0; i < count; i++) {
      const y = 9 - i * 5.4;
      oval(ctx, '#8f6a1f', 0, y + 1.6, 13, 5);
      oval(ctx, '#c79a36', 0, y, 13, 5);
      oval(ctx, '#f0cc6a', 0, y - 0.6, 10, 3.6);
    }
    const top = 9 - (count - 1) * 5.4;
    line(ctx, '#b3862b', 1.1, [[-3.4, top - 0.8], [3.4, top - 0.8]]);
    oval(ctx, '#fff1c4', -5, top - 1.8, 1.6, 0.7);
  }

  function drawGift(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(230,220,200,.35)';
    ctx.shadowBlur = 8;
    polygon(ctx, '#0b0b0d', [[-13, -6], [13, -6], [13, 16], [-13, 16]]);
    ctx.restore();
    polygon(ctx, '#141417', [[-15, -12], [15, -12], [15, -5], [-15, -5]]);
    polygon(ctx, '#232328', [[-2.6, -12], [2.6, -12], [2.6, 16], [-2.6, 16]]);
    ctx.fillStyle = '#18181c';
    ctx.strokeStyle = 'rgba(235,228,210,.28)'; ctx.lineWidth = 0.8;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 6, -15, 6, 3.6, side * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.strokeRect(-13, -6, 26, 22);
    ctx.strokeRect(-15, -12, 30, 7);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 6);
  }

  VesperGame.prototype.drawRewardArt = function (canvas, reward, characterId) {
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height || !reward) return;
    const { width, height } = canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2, height * 0.55);
    const scale = Math.min(width, height) / 52;
    ctx.scale(scale, scale);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (reward.type === 'coins') drawCoins(ctx, reward.amount);
    else if (reward.type === 'gift') drawGift(ctx);
    else if (reward.type === 'accessory' && HEADWEAR[reward.id]) {
      ctx.translate(0, 7);
      ctx.scale(1.6, 1.6);
      HEADWEAR[reward.id](ctx);
    } else {
      const id = reward.type === 'skin' ? reward.id : characterId;
      const mini = reward.type === 'accessory';
      ctx.scale(0.64, 0.64);
      ctx.translate(mini ? 7 : 0, -4);
      oval(ctx, 'rgba(0,0,0,.26)', 0, 18, 20, 5.6);
      this._drawCharacter(ctx, id, 0);
      if (mini) {
        ctx.translate(-26, 10);
        ctx.scale(0.45, 0.45);
        oval(ctx, 'rgba(0,0,0,.26)', 0, 18, 20, 5.6);
        this._drawCharacter(ctx, id, 0);
      }
    }
    ctx.restore();
  };

  VesperGame.CHARACTERS = Object.freeze([
    { id: 'human', name: 'Humano', unlockType: 'free', accent: '#79a2b0' },
    { id: 'ghost', name: 'Fantasma', unlockType: 'free', accent: '#b2d8d0' },
    { id: 'hooded', name: 'Encapuzado', unlockType: 'free', accent: '#bd8292' },
    { id: 'vampire', name: 'Vampiro', unlockType: 'map', unlockMap: 'castle', accent: '#d87783' },
    { id: 'mummy', name: 'Múmia', unlockType: 'map', unlockMap: 'egypt', accent: '#dabb76' },
    { id: 'zombie', name: 'Zumbi', unlockType: 'map', unlockMap: 'swamp', accent: '#a3ba83' },
    { id: 'jack', name: 'Jack o’ Lantern', unlockType: 'map', unlockMap: 'halloween', accent: '#edab66' },
    { id: 'kraken', name: 'Kraken', unlockType: 'map', unlockMap: 'sea', accent: '#6fc3cf' },
    { id: 'yeti', name: 'Yeti', unlockType: 'map', unlockMap: 'snow', accent: '#b9d3ea' },
    { id: 'darkmouse', name: 'Dark Mouse', unlockType: 'map', unlockMap: 'city', accent: '#cfcac0' },
    { id: 'sheriff', name: 'Xerife', unlockType: 'map', unlockMap: 'west', accent: '#d9a45c' },
    { id: 'survivor', name: 'Sobrevivente', unlockType: 'all', accent: '#d8c185' },
    { id: 'banana', name: 'Banana', unlockType: 'daily', unlockDay: 10, both: true, accent: '#f1d45c' },
    { id: 'penguin', name: 'Pinguim', unlockType: 'daily', unlockDay: 15, both: true, accent: '#9fc3de' },
    { id: 'soldier', name: 'Soldado', unlockType: 'coins', both: true, accent: '#8d9c62' },
    { id: 'vespermobile', name: 'Vesper-Móvel', unlockType: 'coins', both: true, accent: '#9aa3b5' },
    { id: 'alien', name: 'Alien', unlockType: 'coins', accent: '#a4d989' },
    { id: 'spider', name: 'Aranha', unlockType: 'coins', accent: '#bc91c7' },
    { id: 'skeleton', name: 'Esqueleto', unlockType: 'coins', accent: '#d9d1b5' },
    { id: 'orc', name: 'Orc', unlockType: 'coins', accent: '#8fae62' },
    { id: 'invisible', name: 'Homem Invisível', unlockType: 'coins', accent: '#cfe0dc' },
    { id: 'frankenstein', name: 'Frankenstein', unlockType: 'coins', accent: '#7fa86a' },
    { id: 'plague', name: 'Médico da Peste', unlockType: 'coins', accent: '#a9b6a0' },
    { id: 'cyborg', name: 'Cyborg', unlockType: 'coins', accent: '#8ad6d0' }
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

  VesperGame.prototype.drawCharacterPreview = function (canvas, id, locked = false, accessories = []) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return;
    const { width, height } = canvas;
    const mini = accessories.includes('mini');
    const scale = Math.min(width / (mini ? 92 : 76), height / 80);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2 + (mini ? 8 * scale : 0), height * 0.65);
    ctx.scale(scale, scale);
    oval(ctx, 'rgba(0,0,0,.26)', 0, 18, 22, 6);
    ctx.globalAlpha = locked ? 0.8 : 1;
    this._drawCharacter(ctx, id, 0);
    this._drawHeadwear(ctx, id, accessories);
    if (mini) {
      ctx.translate(-30, 10.5);
      ctx.scale(0.42, 0.42);
      oval(ctx, 'rgba(0,0,0,.3)', 0, 18, 20, 6);
      this._drawCharacter(ctx, id, 0);
    }
    ctx.restore();
  };
})();
