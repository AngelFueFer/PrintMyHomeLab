// =====================================================================
//  Mini-rack 10" 14U impreso en 3D con raíles METÁLICOS  ·  Home lab de Angel
//  Placa HP IPM17-002 (micro-ATX 244x244) + HP EliteDesk 800 Mini
//  + router Digi + módulos HDD/SSD apilables de MakerWorld
//
//  Uso:  openscad -D 'part="wall_5u_L"' -o wall_5u_L.stl rack10_homelab.scad
//        part = "assembly" (por defecto) muestra el rack montado
//        part = "exploded" muestra el despiece
//  Ejes: X ancho (0 = lateral izq.), Y fondo (0 = frente), Z alto.
//  Todas las medidas en mm. Cambia los parámetros de abajo a tu gusto.
// =====================================================================

part = "assembly";

/* [Estándar 10"] */
U        = 44.45;     // 1U
NU       = 14;        // alturas totales
W        = 254;       // ancho exterior (10")
D        = 250;       // fondo exterior
OPEN     = 222.25;    // hueco entre raíles (estándar 10")
HOLE_X   = (W - 236.525) / 2;   // eje de los agujeros de las orejas (8,74)
HOLE_Z   = [6.35, 22.225, 38.1]; // agujeros dentro de cada U (EIA)

/* [Estructura] */
// Raíles METÁLICOS de rack (perfil en L con agujero cuadrado para tuerca enjaulada M6)
RF       = 15.8;      // ancho de la cara del raíl (las orejas atornillan aquí)
RS       = 20;        // ala lateral del raíl (hacia el fondo)
RT       = 2;         // espesor de la chapa
RAIL_L   = NU * U;    // 14U = 622,3 mm (vale cualquier regleta de rack: 10" y 19" usan el mismo paso)
SQ       = 9.5;       // agujero cuadrado estándar
FL_W     = (W - OPEN) / 2;      // 15,9: zona de raíl a cada lado
WALL     = 3;         // pared lateral impresa
PLATE_T  = 8;         // tapas superior/inferior
POCKET   = 3;         // cajeado donde encajan raíles y paredes
CB_X0    = RT + WALL + 0.3;     // bloque de esquina
CB_Y0    = 9;         // detrás de las tuercas enjauladas
CB       = [RF - CB_X0, 26, 30];
BOLT_Y   = 15;        // tornillo M4 que une raíl + pared + bloque (taladrar el ala del raíl)
M6_D     = 6.6;
SEGS     = [5, 5, 4]; // tramos de pared en U (de abajo arriba)
TOL      = 0.3;

/* [Equipos (medidas aproximadas, ajusta)] */
MB       = [244, 244];          // placa micro-ATX
// agujeros de la placa: [u, v] con u a lo largo del borde del panel I/O
// (desde el lado de la ranura PCIe) y v desde el borde I/O.
// ESTIMADOS a partir de las fotos: verificar con la plantilla 1:1.
MB_HOLES = [[35,10],[79,10],[236.5,27],[12,165],[79,165],[236.5,165],[79,230],[238,228]];
SFX      = [125, 100, 63.5];    // fuente SFX (ancho, fondo, alto)
MINI     = [177, 175, 34];      // EliteDesk 800 Mini
ROUTER   = [220, 160, 40];      // router Digi (MEDIR)
HDD_MOD  = [112, 165, 34];      // módulo 3,5" MakerWorld (aprox.)
SSD_MOD  = [80, 110, 15];       // módulo 2,5" MakerWorld (aprox.)

$fn = 40;
Z0 = PLATE_T - POCKET;           // cota de la U1 (= pie del raíl)
function uz(u) = Z0 + (u - 1) * U;   // base de la U número u

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
module hexnut(af, h) { cylinder(d = af / cos(30), h = h, $fn = 6); }

module slot(len, d, h) {   // agujero alargado en X
    hull() for (s = [-1, 1]) translate([s * (len - d) / 2, 0, 0]) cylinder(d = d, h = h);
}

module vent_slots(w, h, t, pitch = 12, sw = 5, margin = 18) {
    n = floor((h - 2 * margin) / pitch);
    for (i = [0 : n - 1])
        translate([margin, margin + i * pitch, -1])
            hull() for (x = [0, w - 2 * margin]) translate([x, sw / 2, 0]) cylinder(d = sw, h = t + 2);
}

// ---------------------------------------------------------------------
//  1. Raíl metálico (maqueta, se compra) y paredes laterales impresas
// ---------------------------------------------------------------------
module metal_rail() {   // raíl delantero izquierdo; los demás son simetrías
    difference() {
        union() { cube([RF, RT, RAIL_L]); cube([RT, RS, RAIL_L]); }
        for (u = [0 : NU - 1], hz = HOLE_Z)
            translate([HOLE_X - SQ / 2, -1, u * U + hz - SQ / 2]) cube([SQ, RT + 2, SQ]);
    }
}
module at_corners() {   // repite el hijo en las 4 esquinas (simetrías X e Y)
    children();
    translate([W, 0, 0]) mirror([1, 0, 0]) children();
    translate([0, D, 0]) mirror([0, 1, 0]) children();
    translate([W, D, 0]) mirror([1, 0, 0]) mirror([0, 1, 0]) children();
}
module side_wall(nu) {
    h = nu * U;
    difference() {
        union() {
            translate([RT, 4, 0]) cube([WALL, D - 8, h]);
            for (zz = [0, h - 6]) translate([RT, 38, zz]) cube([8, D - 76, 6]);   // nervios
        }
        translate([RT - 1, 0, 0]) rotate([90, 0, 90]) translate([45, 0, 0]) vent_slots(D - 90, h, WALL + 2);
        // M4 que pasa por el ala del raíl (cada 2U y junto a los bloques de esquina)
        for (y = [BOLT_Y, D - BOLT_Y], z = concat([15, h - 15], [for (k = [1 : 2 : nu - 1]) k * U]))
            translate([RT - 1, y, z]) rotate([0, 90, 0]) cylinder(d = 4.4, h = WALL + 2);
        // espigas de 6 mm entre tramos
        for (y = [D / 3, 2 * D / 3], zz = [-1, h - 10]) translate([RT + 4, y, zz]) cylinder(d = 6.3, h = 11);
    }
}
module corner_block() {   // abajo-delante-izquierda; arriba se usa en espejo
    difference() {
        translate([CB_X0, CB_Y0, 0]) cube(CB);
        translate([CB_X0 - 1, BOLT_Y, 15]) rotate([0, 90, 0]) cylinder(d = 5.6, h = 9);   // inserto M4 lateral
        translate([CB_X0 + CB[0] / 2, CB_Y0 + 19, -1]) cylinder(d = 5.6, h = 9);           // inserto M4 a la tapa
    }
}

// ---------------------------------------------------------------------
//  2. Tapa superior / inferior (2 mitades con cola de milano)
// ---------------------------------------------------------------------
module dovetails(extra = 0) {
    for (y = [D * 0.2, D * 0.5, D * 0.8])
        translate([W / 2, y, -1])
            linear_extrude(PLATE_T + 2)
                offset(delta = extra) polygon([[-0.01, -8], [12, -12], [12, 12], [-0.01, 8]]);
}
module plate_full(top = true) {
    // top = true: cajeados en la cara de abajo
    difference() {
        cube([W, D, PLATE_T]);
        // cajeado de raíles y paredes
        at_corners() translate([-0.01, -0.01, top ? -1 : PLATE_T - POCKET]) {
            cube([RF + TOL, RT + TOL, POCKET + 1]); cube([RT + TOL, RS + TOL, POCKET + 1]);
        }
        for (x = [0, W - RT - WALL - TOL]) translate([x, 3.5, top ? -1 : PLATE_T - POCKET]) cube([RT + WALL + TOL, D - 7, POCKET + 1]);
        // tornillos M4 avellanados a los bloques de esquina
        at_corners() translate([CB_X0 + CB[0] / 2, CB_Y0 + 19, -1]) {
            cylinder(d = 4.5, h = PLATE_T + 2);
            translate([0, 0, top ? PLATE_T - 1.4 : 0]) cylinder(d1 = top ? 4.5 : 9, d2 = top ? 9 : 4.5, h = 2.5);
        }
        // insertos M4 para las patas
        if (!top) for (x = [28, W - 28], y = [40, D - 40]) translate([x, y, -1]) cylinder(d = 5.6, h = 7);
        // rejilla de ventilación
        translate([35, 35, -1]) for (i = [0 : 8]) translate([0, i * 20, 0])
            hull() { cylinder(d = 8, h = PLATE_T + 2); translate([W / 2 - 60, 0, 0]) cylinder(d = 8, h = PLATE_T + 2); }
        translate([W / 2 + 25, 35, -1]) for (i = [0 : 8]) translate([0, i * 20, 0])
            hull() { cylinder(d = 8, h = PLATE_T + 2); translate([W / 2 - 60, 0, 0]) cylinder(d = 8, h = PLATE_T + 2); }
        // pasacables trasero
        translate([W / 2 - 40, D - 40, -1]) cube([80, 25, PLATE_T + 2]);
    }
}
module plate_half(side = 0, top = true) {   // side 0 = izquierda (con colas), 1 = derecha
    if (side == 0) {
        intersection() { plate_full(top); union() { cube([W / 2, D, PLATE_T]); dovetails(-TOL / 2); } }
    } else {
        difference() { intersection() { plate_full(top); translate([W / 2, 0, 0]) cube([W / 2, D, PLATE_T]); } dovetails(TOL / 2); }
    }
}
module foot() {
    difference() {
        cylinder(d1 = 30, d2 = 24, h = 12);
        translate([0, 0, -1]) cylinder(d = 4.5, h = 20);
        translate([0, 0, -1]) cylinder(d = 9, h = 8);    // cabeza M4 x 20
    }
}

// ---------------------------------------------------------------------
//  3. Frontales / traseras con orejas (n U)
// ---------------------------------------------------------------------
module ear_holes(nu, t) {
    for (u = [0 : nu - 1], hz = HOLE_Z, x = [HOLE_X, W - HOLE_X])
        translate([x, -1, u * U + hz]) rotate([-90, 0, 0]) hull() for (dx = [-1.5, 1.5]) translate([dx, 0, 0]) cylinder(d = M6_D, h = t + 2);
}
module face_plate(nu, t = 4, window = [0, 0], z_hole = false) {
    h = nu * U - 0.8;
    difference() {
        union() {
            translate([0, -t, 0]) cube([W, t, h]);
            // nervio de refuerzo detrás, entre raíles
            translate([FL_W + TOL, 0, 0]) cube([OPEN - 2 * TOL, 6, 4]);
            translate([FL_W + TOL, 0, h - 4]) cube([OPEN - 2 * TOL, 6, 4]);
        }
        translate([0, -t, 0]) ear_holes(nu, t);
        if (window[0] > 0)
            translate([(W - window[0]) / 2, -t - 1, (h - window[1]) / 2]) cube([window[0], t + 2, window[1]]);
    }
}
// 1U: patch panel de 8 keystones (hueco estándar 14,9 x 16,5)
module patch_panel() {
    difference() {
        face_plate(1);
        for (i = [0 : 7]) translate([W / 2 - 3.5 * 25 + i * 25 - 7.45, -5, (U - 0.8 - 16.5) / 2]) cube([14.9, 7, 16.5]);
    }
}
// Bandeja (Router / Mini / discos): suelo entre raíles, atornillado al frontal y a la trasera
module tray(nu, lip = 15) {
    difference() {
        union() {
            translate([FL_W + TOL, 0, 0]) cube([OPEN - 2 * TOL, D, 3]);
            for (x = [FL_W + TOL, W - FL_W - TOL - 3]) translate([x, 0, 0]) cube([3, D, lip]);
            // pestañas para atornillar a frontal/trasera (M3)
            for (y = [0, D - 6], x = [60, W - 60]) translate([x - 8, y, 0]) cube([16, 6, 14]);
        }
        for (y = [-1, D - 7], x = [60, W - 60]) translate([x, y, 8]) rotate([-90, 0, 0]) cylinder(d = 3.2, h = 9);
        // ventilación
        for (i = [0 : 9]) translate([FL_W + 30, 25 + i * 21, -1]) hull() { cylinder(d = 7, h = 5); translate([OPEN - 60, 0, 0]) cylinder(d = 7, h = 5); }
    }
}
// Topes para que el equipo no se mueva en la bandeja
module stops(sz, y0 = 30) {
    x0 = (W - sz[0]) / 2;
    for (p = [[x0 - 6, y0], [x0 + sz[0] + 1, y0], [x0 - 6, y0 + sz[1] - 30], [x0 + sz[0] + 1, y0 + sz[1] - 30]])
        translate([p[0], p[1], 3]) cube([5, 30, 12]);
}

// ---------------------------------------------------------------------
//  4. Módulo de cómputo 6U: placa en vertical + fuente SFX + SSD
// ---------------------------------------------------------------------
MB_PLATE_X = FL_W + TOL + 3;          // la placa de montaje va pegada al raíl izquierdo
STANDOFF   = 8;
module mb_plate() {
    // placa vertical (plano Y-Z). Borde I/O de la placa base hacia ATRÁS.
    ph = 252;                   // cabe en cama de 256
    difference() {
        union() {
            cube([4, D - 2, ph]);
            // bosses para insertos M3
            for (p = MB_HOLES) translate([0, mb_y(p), mb_z(p)]) rotate([0, 90, 0]) cylinder(d = 9, h = 4 + STANDOFF);
            // escuadras a la bandeja
            for (y = [40, D / 2, D - 45]) translate([0, y, 0]) rotate([90, 0, 0]) linear_extrude(4) polygon([[0, 0], [11, 0], [0, 9]]);
            translate([0, 0, 0]) cube([30, D - 2, 4]);
        }
        for (p = MB_HOLES) translate([-1, mb_y(p), mb_z(p)]) rotate([0, 90, 0]) cylinder(d = 4.2, h = 20);  // inserto M3
        // aligerado/ventilación detrás del disipador
        translate([-1, 105, 150]) cube([6, 90, 85]);
        // tornillos a la bandeja
        for (y = [45, D / 2 + 25, D - 50]) translate([18, y, -1]) cylinder(d = 3.4, h = 6);
    }
}
// conversión de coords de la placa base (u,v) al plano de montaje
MB_Z0 = 10;                       // borde inferior de la placa sobre la bandeja
function mb_y(p) = (D - 2) - 3 - p[1];   // v=0 (borde I/O) hacia atrás
function mb_z(p) = MB_Z0 + p[0];
module sfx_cradle() {
    x0 = W - FL_W - 8 - SFX[2];
    difference() {
        union() {
            translate([x0 - 4, 8, 0]) cube([SFX[2] + 8, SFX[1] + 8, 20]);
            translate([x0 - 4, 8, 0]) cube([4, SFX[1] + 8, 60]);
        }
        translate([x0, 12, 3]) cube([SFX[2] + 0.6, SFX[1] + 0.6, 30]);
        for (z = [30, 45]) translate([x0 - 6, 20, z]) cube([8, 20, 4]);   // ranuras para velcro
        for (z = [30, 45]) translate([x0 - 6, SFX[1] - 20, z]) cube([8, 20, 4]);
    }
}
// Frontal 6U en 2 mitades de 3U (la pieza entera no cabe en la cama)
module compute_face(half = 0) {
    h = 3 * U - 0.4;
    difference() {
        union() {
            translate([0, -4, 0]) cube([W, 4, h]);
            translate([FL_W + TOL, 0, half == 0 ? h - 4 : 0]) cube([OPEN - 2 * TOL, 6, 4]);
        }
        translate([0, -4, 0]) ear_holes(3, 4);
        // rejilla
        for (i = [0 : 6]) translate([40, -5, 20 + i * 14]) hull() { rotate([-90, 0, 0]) cylinder(d = 6, h = 6); translate([110, 0, 0]) rotate([-90, 0, 0]) cylinder(d = 6, h = 6); }
        if (half == 1) {
            translate([200, -5, h - 40]) rotate([-90, 0, 0]) cylinder(d = 16.2, h = 12);  // pulsador 16 mm
            translate([200, -5, h - 65]) rotate([-90, 0, 0]) cylinder(d = 5.2, h = 12);   // LED 5 mm
        }
        // unión entre mitades: 2 espigas 4 mm
        for (x = [W * 0.3, W * 0.7]) translate([x, -2, half == 0 ? h - 6 : -1]) cylinder(d = 2.2, h = 7);
    }
}
// Frontal 3U de almacenamiento con hueco para ventilador de 80 mm
module storage_face() {
    h = 3 * U - 0.8;
    difference() {
        face_plate(3);
        translate([W - 80, -5, h / 2]) rotate([-90, 0, 0]) for (r = [10 : 9 : 36]) difference() { cylinder(r = r + 2.5, h = 7); translate([0, 0, -1]) cylinder(r = r, h = 9); }
        for (a = [45 : 90 : 315]) translate([W - 80, -5, h / 2]) rotate([0, a, 0]) translate([50.56, 0, 0]) rotate([-90, 0, 0]) cylinder(d = 4.4, h = 7);  // 80 mm: 71,5 entre ejes
        for (i = [0 : 5]) translate([30, -5, 22 + i * 16]) hull() { rotate([-90, 0, 0]) cylinder(d = 6, h = 7); translate([90, 0, 0]) rotate([-90, 0, 0]) cylinder(d = 6, h = 7); }
    }
}
// Trasera genérica (n U) con hueco grande para cables
module rear_frame(nu) { translate([0, D + 4, 0]) mirror([0, 1, 0]) face_plate(nu, 4, [OPEN - 30, nu * U - 22]); }

// ---------------------------------------------------------------------
//  Maquetas (no se imprimen) para ver el conjunto
// ---------------------------------------------------------------------
module mb_comp(u, v, n, du, dv, dn, c) { color(c) translate([1.6 + n, MB[1] - v - dv, u]) cube([dn, dv, du]); }
module mock_board() {
    color("#2f6b3a") cube([1.6, MB[1], MB[0]]);
    mb_comp(132, 48, 0, 96, 96, 22, "#555");       // disipador
    mb_comp(136, 52, 22, 88, 88, 30, "#222");      // ventilador
    mb_comp(125, 164, 0, 115, 8, 30, "#1e3d24");   // RAM
    mb_comp(125, 180, 0, 115, 8, 30, "#1e3d24");
    mb_comp(100, -3, 0, 130, 22, 38, "#c0c4c8");   // panel I/O
    mb_comp(96, 14, 0, 8, 92, 11, "#111");         // PCIe x16
    mb_comp(20, 128, 0, 52, 46, 14, "#c0c4c8");    // chipset
    mb_comp(102, 226, 0, 52, 15, 16, "#eee");      // ATX 24 pines
}
module mock_mini()   { color("#3b3e44") cube(MINI); color("#999") translate([10, -0.5, 10]) cube([30, 1, 8]); }
module mock_router() { color("#eeeeec") cube(ROUTER); }
module mock_sfx()    { color("#5a5f66") cube([SFX[2], SFX[1], SFX[0]]); }
module mock_hdd(n)   { for (i = [0 : n - 1]) translate([0, 0, i * HDD_MOD[2]]) color("#3a7fc4") cube(HDD_MOD - [0, 0, 1]); }
module mock_ssd(n)   { for (i = [0 : n - 1]) translate([0, 0, i * SSD_MOD[2]]) color("#8a63c9") cube(SSD_MOD - [0, 0, 0.8]); }
module mock_fan80()  { color("#222") difference() { cube([80, 25, 80]); translate([40, -1, 40]) rotate([-90, 0, 0]) cylinder(d = 74, h = 27); } }

// ---------------------------------------------------------------------
//  Montaje
// ---------------------------------------------------------------------
PRINT = "#e9893c"; PRINT2 = "#f3b27a"; PRINT3 = "#d26a1f";

module rack_frame(ex = 0) {
    for (i = [0 : len(SEGS) - 1]) {
        zz = Z0 + U * (i == 0 ? 0 : sum_to(SEGS, i));
        color(i % 2 ? PRINT2 : PRINT) translate([-ex, 0, zz + ex * i]) side_wall(SEGS[i]);
        color(i % 2 ? PRINT2 : PRINT) translate([W + ex, 0, zz + ex * i]) mirror([1, 0, 0]) side_wall(SEGS[i]);
    }
    color("#9aa1a8") translate([0, 0, Z0 + ex]) at_corners() translate([0, 0, 0]) metal_rail();
    color(PRINT3) { at_corners() translate([0, 0, PLATE_T + ex * 0.3]) corner_block();
                    at_corners() translate([0, 0, Z0 + NU * U - POCKET - ex * 0.3]) mirror([0, 0, 1]) corner_block(); }
    color(PRINT3) translate([0, 0, -ex]) plate_full(false);
    color(PRINT3) translate([0, 0, Z0 + NU * U - POCKET + ex * 3]) plate_full(true);
    color("#222") for (x = [28, W - 28], y = [40, D - 40]) translate([x, y, -12 - ex * 1.5]) foot();
}
function sum_to(v, i) = i <= 0 ? 0 : v[i - 1] + sum_to(v, i - 1);

module compute_contents() {
    color(PRINT) tray(6, 10);
        translate([MB_PLATE_X, 0, 3]) { color(PRINT3) mb_plate(); translate([4 + STANDOFF, 1, MB_Z0]) mock_board(); }
        color(PRINT3) translate([0, 0, 3]) sfx_cradle();
        translate([W - FL_W - 8 - SFX[2], 12, 6]) mock_sfx();
        translate([W - FL_W - 8 - SSD_MOD[0], 130, 3]) mock_ssd(6);
}

module units(ex = 0) {
    // U1-3 almacenamiento
    translate([0, -ex, uz(1)]) color(PRINT2) storage_face();
    translate([0, 0, uz(1)]) { color(PRINT) tray(3); translate([30, 40, 3]) mock_hdd(3); translate([W - 120, 10, 3]) mock_fan80(); translate([W - 115, 120, 3]) mock_ssd(2); }
    // U4-9 cómputo
    translate([0, -ex, uz(4)]) color(PRINT2) compute_face(0);
    translate([0, -ex, uz(4) + 3 * U]) color(PRINT2) compute_face(1);
    translate([0, 0, uz(4)]) compute_contents();
    // U10-11 EliteDesk Mini
    translate([0, -ex, uz(10)]) color(PRINT2) face_plate(2, 4, [190, 60]);
    translate([0, 0, uz(10)]) { color(PRINT) tray(2); color(PRINT3) stops(MINI); translate([(W - MINI[0]) / 2, 30, 3]) mock_mini(); }
    // U12-13 router
    translate([0, -ex, uz(12)]) color(PRINT2) face_plate(2, 4, [200, 60]);
    translate([0, 0, uz(12)]) { color(PRINT) tray(2); translate([(W - ROUTER[0]) / 2, 50, 3]) mock_router(); }
    // U14 patch panel
    translate([0, -ex, uz(14)]) color(PRINT) patch_panel();
    // traseras
    for (b = [[1, 3], [4, 3], [7, 3], [10, 2], [12, 2]]) translate([0, ex, uz(b[0])]) color(PRINT2, 0.9) rear_frame(b[1]);
}

// ---------------------------------------------------------------------
//  Selector de piezas (orientadas para imprimir)
// ---------------------------------------------------------------------

if (part == "assembly") { rack_frame(); units(); }
else if (part == "exploded") { rack_frame(40); units(120); }
else if (part == "compute") { compute_contents(); color(PRINT2, 0.9) { rear_frame(3); translate([0, 0, 3 * U]) rear_frame(3); } color(PRINT2) translate([0, -60, 0]) compute_face(0); }
else if (part == "wall_5u_L")   rotate([0, -90, 0]) translate([-RT, 0, 0]) side_wall(5);
else if (part == "wall_5u_R")   translate([0, 0, -RT]) rotate([0, 90, 0]) mirror([1, 0, 0]) side_wall(5);
else if (part == "wall_4u_L")   rotate([0, -90, 0]) translate([-RT, 0, 0]) side_wall(4);
else if (part == "wall_4u_R")   translate([0, 0, -RT]) rotate([0, 90, 0]) mirror([1, 0, 0]) side_wall(4);
else if (part == "corner_block") translate([-CB_X0, -CB_Y0, 0]) corner_block();
else if (part == "plate_top_L")    plate_half(0, true);
else if (part == "plate_top_R")    translate([-W / 2, 0, 0]) plate_half(1, true);
else if (part == "plate_bottom_L") plate_half(0, false);
else if (part == "plate_bottom_R") translate([-W / 2, 0, 0]) plate_half(1, false);
else if (part == "foot")        foot();
else if (part == "patch_1u")    translate([0, 0, 4]) rotate([90, 0, 0]) patch_panel();
else if (part == "face_2u_mini")   translate([0, 0, 4]) rotate([90, 0, 0]) face_plate(2, 4, [190, 60]);
else if (part == "face_2u_router") translate([0, 0, 4]) rotate([90, 0, 0]) face_plate(2, 4, [200, 60]);
else if (part == "face_3u_storage") translate([0, 0, 4]) rotate([90, 0, 0]) storage_face();
else if (part == "face_compute_low") translate([0, 0, 4]) rotate([90, 0, 0]) compute_face(0);
else if (part == "face_compute_high") translate([0, 0, 4]) rotate([90, 0, 0]) compute_face(1);
else if (part == "rear_2u")     translate([0, 0, 4]) rotate([-90, 0, 0]) translate([0, -D - 4, 0]) rear_frame(2);
else if (part == "rear_3u")     translate([0, 0, 4]) rotate([-90, 0, 0]) translate([0, -D - 4, 0]) rear_frame(3);
else if (part == "tray")        translate([-FL_W, 0, 0]) tray(2);
else if (part == "tray_compute") translate([-FL_W, 0, 0]) tray(6, 10);
else if (part == "mini_stops")  translate([0, 0, -3]) stops(MINI);
else if (part == "mb_plate")    rotate([0, -90, 0]) mb_plate();
else if (part == "sfx_cradle")  translate([-(W - FL_W - 8 - SFX[2] - 4), -8, 0]) sfx_cradle();
else if (part == "mb_template") {
    difference() { square(MB); translate([0.5, 0.5]) square(MB - [1, 1]); }
    for (p = MB_HOLES) translate([p[0], MB[1] - p[1]]) difference() { circle(d = 10); circle(d = 3.2); }
    translate([MB[0] / 2, MB[1] - 18]) text("BORDE I/O (arriba)", size = 7, halign = "center");
    translate([MB[0] / 2, MB[1] / 2]) text("Plantilla 1:1 - cara de componentes", size = 6, halign = "center");
    translate([10, 8]) difference() { square([100, 6]); translate([0.3, 0.3]) square([99.4, 5.4]); }
    translate([60, 18]) text("100 mm (comprobar escala)", size = 5, halign = "center");
}
