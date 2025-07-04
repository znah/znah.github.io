"use strict";
const canvas = document.getElementById('demo-canvas');
const glsl = SwissGL(canvas);

let move = [0,0,0];
canvas.addEventListener('pointermove', e=>{
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const s = 2.0/Math.max(w, h)
    move[0] = (e.offsetX-w/2)*s;
    move[1] = (h/2-e.offsetY)*s;
    move[2] += (1.0-move[2])*0.1;
});
setInterval(()=>{
    move[2] *= 0.99;
}, 10);

glsl.loop(({time})=>{
    glsl.adjustCanvas();        

    const bg = [0.1,0.1,0.2];
    const dy = time*0.05;
    const rayPos = [-0.1,-0.1,0.4];

    const Inc = `vec4 toview(vec3 p, vec2 viewOfs) {
        vec4 v = vec4(p, 1.0);
        v.xy *= rot2(0.3);
        v.yz *= rot2(0.7);
        v.xy += viewOfs;
        //v.xyz *= 0.3;
        v.xy *= viewCover();
        v.zw = vec2(-v.z*0.1, 1.0-v.z*0.6);
        return v;
    }
    vec2 flap(float x, float y, float p) {
        float xp = x*p, yp1 = 1.0-y*p;
        if (abs(p)<1e-3) {
            return vec2(yp1 * (1.-xp*xp/6.)*x, y + xp*(x - y*xp)/2.);
        } else {
            return vec2(yp1 * sin(xp), (1.-yp1 * cos(xp))) / p;
        }
    }
    `;

    // inspired by https://www.shadertoy.com/view/4cl3W4
    const cau = glsl({time, FP:`
        vec3 p = vec3(UV*5.0, 1.0);
        p.z += time*0.8;
        float a = 1.0;
        for (int i=0; i<3; ++i) {
            p *= mat3(-2,-2,2, 3,-2,1, 1,2,2)*.3;
            float b = length(.5-fract(p));
            a = 0.5*(a+b-sqrt((b-a)*(b-a)+0.01)); // smin by iq
        }
        a*=a; a*=a;
        FOut.rgb = vec3(a*10.);
    `}, {size:[256, 256], format:'r8', wrap:'mirror', filter:'linear', tag:'cau'});

    // scene
    glsl({Mesh:[12, 8], Grid:[1500], time, bg, cau, dy, rayPos, move,
        DepthTest:1, Inc, VP:`
        varying vec3 color, p=vec3(0);
        const vec3 bottom = vec3(0.1,0.15,0.2);
        if (ID.x==0) { // bottom
            p = vec3(XY.yx*vec2(2., 2.0)+vec2(0.0,1.0), 0);
            color = bottom;
        } else if (ID.x<3) { // fish
            float i = float(ID.x-1);
            float r = (UV.y-1.0)*(UV.y-0.12);
            p.xzy = vec3(rot2(XY.x*PI)[0]*vec2(0.4,1.3)*r, XY.y)*0.06;
            color = mix(vec3(0.1,0.0,0.0), vec3(0.15,0.15,0.1), (sin(XY.x*TAU*2.)*0.5+0.5));
            p.x += sin((time-i*0.7)*2.5+UV.y*3.)*0.015*(1.5-UV.y*0.5);
            p.xyz += vec3(-0.15+0.1*i, -0.5-0.1*i, 0.5);
        } else {  // corals
            vec3 rnd = hash(ID.xyx);
            p = vec3(rot2(XY.x*PI)[0]*0.05, UV.y);
            p.xy *= 0.5+p.z*p.z*p.z;
            p *= 0.05+rnd.z*0.2;
            vec2 pos = rnd.xy;
            pos.y = fract(pos.y - dy);
            pos = (pos-vec2(0.5,0.3))*3.5;
            float flapCoef = (sin(time*1.3-pos.x*3.+fract(rnd.x*1000.))+1.0)*3.;
            float d = length(move.xy-pos.xy);
            p *= mix(1.0, smoothstep(0.0,0.5,d), move.z);

            p.zx = flap(p.z, p.x, flapCoef);
            p.xy += pos;
            color = vec3(0.5+rot2(rnd.z*1000.0)[0]*0.1,.7);
            color = mix(bottom, color, UV.y);
        }
        VPos = toview(p, vec2(0));
        varying float fog = exp(-((VPos.z+0.05)*15.0));
    `, FP:`
        vec2 dray = (p.xy-rayPos.xy)*vec2(4.0+sin(time), 4.0);
        vec2 pos = p.xy+vec2(0.0,dy*3.0);
        vec3 c = cau(pos+0.5).r*vec3(0.5,0.9,1.0)*1.8;
        FOut.rgb = mix(bg, color*(1.0+c), fog);
        FOut.rgb *= 1.0-exp(-dot(dray, dray))*0.7
    `});

    // ray
    glsl({Mesh:[33,33], time, Inc, cau, dy, rayPos,
        DepthTest:1, MeshMode:0, VP:`
        varying vec3 p = vec3(0);
        p.xy = rot2(PI/4.0)*XY;
        if (VID==ivec2(0,0)) {
            p.y -= 2.6;
        }
        float u = abs(p.x);
        p.x -= clamp(p.x, -0.02, 0.02);
        p.y = p.y*0.5 + u*u*(1.0-u)*0.4;
        p.xz = flap(p.x, p.z, (sin(time+p.y*0.8)*1.5+0.2));
        p = p*0.3+rayPos;
        VPos = toview(p, vec2(0));
    `, FP:`
        vec2 pos = p.xy+vec2(0.0,dy*3.0);
        vec3 c = 0.1*cau(pos+0.5).r*vec3(0.5,0.9,1.0);
        FOut = vec4(0.02+vec3(!gl_FrontFacing)*0.6+c,1)`});

    // ray
    glsl({time, Inc, dy, rayPos, Grid:[2000],
        DepthTest:'keep', Blend:'s+d', VP:`
        varying vec3 p = hash(ID.xyy)-vec3(0.5,0.5, 0.2);
        float phase = hash(ID.xyx+1).x + time*0.5;
        varying float alpha = max(sin(phase*2.0*PI), 0.0);
        alpha = 0.1 + alpha*alpha*alpha;
        p.y = fract(p.y - dy)-0.4;
        p.xy *= 3.5;
        VPos = toview(p, XY*0.005);
    `, FP:`(1.0-dot(XY,XY))*0.7*alpha`});        
});