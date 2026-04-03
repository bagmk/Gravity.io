export const MAP_W = 10000;
export const MAP_H = 10000;
export const FOOD_COUNT = 3000;
export const AI_COUNT = 12;
export const BH_COUNT = 6;
export const INITIAL_MASS = 12;
export const THRUST = 320;
export const AI_THRUST = 280;
export const WELL_G = 3000;
export const FOOD_G = 600;
export const FOOD_FOOD_G = 30;
export const BH_MASS = 300;
export const BH_LJ_EQ = 250;
export const BH_LJ_STR = 80000;
export const BH_KILL_R = 45;
export const ABSORB_RATIO = 0.75;
export const BOOST_MULT = 3.5;
export const BOOST_COST = 0.4;
export const DECAY_RATE = 0.001;
export const DRAG = 0;

export const PALETTES = [
  ["#ff6b6b","#ff8787"],["#66d9e8","#3bc9db"],["#ffd43b","#fcc419"],
  ["#b197fc","#9775fa"],["#69db7c","#51cf66"],["#ffa94d","#ff922b"],
  ["#f783ac","#e64980"],["#91a7ff","#748ffc"],["#e599f7","#cc5de8"],
  ["#63e6be","#38d9a9"],
];

export const NAMES = ["Nova","Pulsar","Quasar","Nebula","Photon","Muon","Gluon","Boson","Lepton","Hadron"];

export const DEFAULTS = {
  drag: 1.2, thrust: 320, foodG: 5000,
  wellG: 50000, bhMass: 300, foodCount: 3000,
};

export const SLINGSHOT_R    = 350;   // zone radius for slingshot detection
export const ORBIT_TIME_REQ = 2.5;  // seconds to confirm orbit lock
