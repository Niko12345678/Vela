/* Il gioco originale, spostato qui integro.
   Da qui si estrae un pezzo alla volta verso src/sim e src/render,
   con la golden test a fare da rete di sicurezza a ogni passo. */

"use strict";
/* ══════════════════ utilità ══════════════════ */
const TAU=Math.PI*2, D2R=Math.PI/180, R2D=180/Math.PI;
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
// angolo normalizzato in [-π, π)
function norm(a){a=(a+Math.PI)%TAU; if(a<0)a+=TAU; return a-Math.PI;}
// convenzione bussola: 0 = Nord (su), 90 = Est (destra)
function dv(a){return {x:Math.sin(a), y:-Math.cos(a)};}
function angOf(x,y){return Math.atan2(x,-y);}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ══════════════════ costanti fisiche ══════════════════ */
const K={
  SAIL_MAIN:12,   // ½·ρ·superficie randa
  REEF:[1,0.66,0.44],         // mani di terzaroli: si riduce la randa col vento forte
  SAIL_JIB:7,     // ½·ρ·superficie fiocco
  SAIL_SPI:19,    // ½·ρ·superficie spinnaker: enorme, ma solo alle andature portanti
  CLmax:1.55, CD0:0.10, CDmax:1.35,
  MASS:3400,                 // dislocamento realistico: dà abbrivio, non cambia il regime
  HULL_F:85, LIN_F:60,        // resistenza longitudinale scafo
  HULL_L:4200, LIN_L:2200,    // deriva: resistenza laterale
  RUDDER:0.080,               // efficacia timone
  VHULL:5.0, WAVE:12,        // resistenza d'onda vicino alla velocità critica dello scafo
  YAWTAU:1.05,                // inerzia di rotazione: la barca non gira all'istante
  YAW:5.0e-4,                 // conversione forza laterale -> momento di imbardata
  ARM_M:1.00, ARM_J:1.20,     // bracci: randa a poppavia, fiocco a proravia del centro di deriva
  LOA:11,                     // lunghezza fuori tutto (m)
};
let MARK_R=45;

/* ══════════════════ mondo procedurale ══════════════════ */
/* Coste reali del Mar Ionio (Natural Earth 10m, interpolate con spline).
   Comprende la costa della Grecia continentale, ritagliata sul bordo della carta.
   Skorpios, troppo piccola per quel dato, è ricostruita alla sua posizione.
   Forme e posizioni relative sono vere; le distanze sono ridotte 1:6,
   altrimenti una traversata durerebbe ore.                              */
const IONIO={size:25632,start:{x:1544,y:-4125},geo:{lat0:38.489753,lon0:20.719675,gx:14522.01,gy:18429.00},isl:[
{n:"Grecia",l:[3962,-5612],p:[5476,158,5450,152,5420,142,5381,127,5321,104,5253,75,5218,46,5243,17,5301,-13,5352,-37,5377,-51,5395,-59,5417,-66,5453,-71,5493,-74,5515,-80,5508,-90,5484,-103,5457,-119,5431,-143,5401,-170,5374,-192,5344,-194,5315,-191,5309,-218,5344,-302,5401,-416,5448,-513,5470,-575,5482,-621,5487,-662,5488,-703,5483,-739,5465,-772,5428,-808,5378,-840,5331,-855,5291,-844,5254,-815,5217,-781,5180,-742,5143,-698,5104,-660,5057,-634,5009,-616,4969,-596,4949,-575,4938,-553,4916,-525,4871,-484,4815,-436,4757,-393,4700,-356,4641,-324,4592,-311,4558,-323,4534,-354,4515,-394,4505,-441,4500,-496,4483,-563,4442,-647,4390,-741,4349,-828,4325,-880,4313,-924,4317,-1029,4347,-1253,4394,-1537,4429,-1782,4449,-1944,4456,-2067,4430,-2183,4348,-2285,4232,-2380,4125,-2514,4041,-2738,3965,-3002,3899,-3206,3864,-3304,3840,-3342,3767,-3364,3597,-3375,3379,-3369,3202,-3371,3109,-3385,3056,-3407,3006,-3441,2943,-3490,2882,-3550,2829,-3616,2799,-3641,2777,-3672,2727,-3843,2620,-4290,2486,-4878,2375,-5332,2314,-5524,2277,-5583,2233,-5626,2172,-5695,2106,-5749,2037,-5778,1967,-5776,1896,-5749,1824,-5706,1752,-5645,1680,-5569,1611,-5487,1548,-5401,1488,-5309,1437,-5224,1397,-5137,1365,-5057,1333,-5022,1297,-5067,1260,-5158,1226,-5222,1196,-5230,1168,-5212,1140,-5188,1111,-5157,1081,-5120,1049,-5096,1014,-5103,977,-5123,935,-5125,883,-5085,826,-5027,779,-4992,752,-4999,735,-5028,722,-5068,711,-5118,704,-5178,694,-5235,695,-5274,692,-5311,640,-5376,488,-5501,287,-5655,141,-5778,100,-5833,115,-5856,141,-5892,172,-5958,215,-6038,252,-6129,276,-6235,294,-6352,317,-6466,346,-6575,381,-6681,432,-6767,506,-6829,597,-6871,693,-6898,799,-6904,910,-6894,1005,-6887,1075,-6888,1129,-6893,1172,-6902,1207,-6917,1231,-6936,1243,-6961,1238,-6996,1220,-7038,1195,-7078,1163,-7115,1124,-7151,1083,-7183,1051,-7207,1018,-7229,964,-7258,867,-7296,749,-7343,652,-7404,593,-7485,556,-7581,529,-7682,510,-7791,501,-7906,501,-8015,507,-8110,521,-8198,550,-8294,604,-8423,672,-8559,729,-8642,762,-8639,783,-8582,807,-8506,831,-8412,858,-8298,900,-8200,966,-8134,1047,-8085,1134,-8042,1225,-7998,1320,-7961,1415,-7949,1510,-7973,1604,-8023,1689,-8088,1764,-8167,1830,-8262,1890,-8360,1945,-8472,1994,-8589,2037,-8671,2075,-8699,2109,-8693,2136,-8671,2157,-8631,2172,-8575,2183,-8524,2192,-8487,2198,-8455,2200,-8426,2199,-8400,2194,-8378,2186,-8356,2169,-8333,2148,-8312,2136,-8294,2139,-8282,2149,-8273,2162,-8263,2177,-8252,2194,-8240,2207,-8225,2216,-8207,2221,-8187,2217,-8160,2183,-8120,2139,-8075,2136,-8042,2208,-8031,2322,-8032,2430,-8038,2518,-8042,2601,-8051,2675,-8072,2742,-8106,2801,-8153,2849,-8221,2879,-8331,2898,-8463,2920,-8557,2949,-8589,2982,-8583,3019,-8557,3063,-8501,3111,-8424,3160,-8367,3207,-8348,3255,-8350,3306,-8359,3361,-8375,3419,-8399,3483,-8416,3558,-8424,3638,-8426,3714,-8419,3784,-8400,3849,-8373,3909,-8344,3958,-8316,4001,-8285,4047,-8257,4096,-8230,4147,-8206,4209,-8186,4297,-8176,4395,-8171,4469,-8156,4501,-8129,4509,-8091,4507,-8038,4496,-7963,4476,-7871,4460,-7780,4447,-7688,4437,-7595,4443,-7519,4471,-7467,4513,-7431,4565,-7402,4625,-7383,4694,-7372,4762,-7352,4821,-7324,4879,-7287,4955,-7228,5073,-7115,5210,-6979,5309,-6898,5340,-6919,5332,-6996,5327,-7064,5337,-7103,5348,-7133,5362,-7159,5380,-7181,5400,-7200,5424,-7219,5455,-7239,5490,-7261,5515,-7287,5526,-7317,5527,-7353,5515,-7402,5477,-7477,5427,-7566,5403,-7639,5430,-7976,5484,-8296,5524,-7730,5524,159,5513,744,5497,453]},
{n:"Cefalonia",l:[-1207,5645],p:[-17,7809,-76,7768,-131,7715,-204,7637,-305,7512,-424,7361,-551,7228,-680,7131,-816,7052,-967,6982,-1145,6914,-1339,6855,-1525,6823,-1704,6817,-1875,6839,-2017,6903,-2111,7054,-2176,7248,-2246,7366,-2323,7343,-2405,7243,-2515,7150,-2686,7096,-2885,7047,-3047,6989,-3144,6909,-3203,6818,-3246,6737,-3273,6682,-3283,6638,-3291,6573,-3301,6464,-3310,6336,-3319,6231,-3320,6181,-3321,6154,-3345,6096,-3415,5969,-3509,5810,-3583,5675,-3625,5584,-3647,5517,-3643,5478,-3603,5469,-3536,5487,-3462,5527,-3383,5599,-3298,5694,-3220,5770,-3151,5819,-3089,5850,-3047,5856,-3026,5830,-3024,5780,-3047,5720,-3111,5654,-3200,5579,-3279,5498,-3324,5436,-3360,5367,-3423,5219,-3543,4911,-3690,4524,-3813,4217,-3887,4063,-3936,3989,-3983,3941,-4036,3894,-4087,3873,-4132,3893,-4174,3972,-4211,4091,-4236,4209,-4247,4297,-4245,4384,-4231,4505,-4197,4695,-4150,4919,-4118,5115,-4110,5256,-4117,5369,-4137,5478,-4172,5596,-4220,5709,-4274,5801,-4332,5860,-4396,5898,-4462,5932,-4529,5962,-4598,5988,-4664,6026,-4728,6094,-4790,6175,-4841,6233,-4878,6260,-4904,6264,-4931,6233,-4948,6148,-4965,6028,-5018,5916,-5145,5833,-5308,5759,-5434,5675,-5495,5564,-5519,5443,-5527,5342,-5521,5279,-5498,5236,-5469,5189,-5434,5130,-5393,5068,-5355,5005,-5320,4942,-5287,4879,-5267,4818,-5264,4761,-5274,4707,-5288,4654,-5307,4601,-5331,4549,-5345,4499,-5342,4451,-5330,4406,-5313,4364,-5290,4325,-5261,4291,-5231,4262,-5205,4247,-5178,4237,-5139,4209,-5079,4155,-5007,4082,-4937,3981,-4872,3844,-4809,3679,-4756,3500,-4717,3308,-4689,3102,-4667,2899,-4657,2674,-4653,2451,-4643,2321,-4618,2352,-4587,2476,-4562,2584,-4554,2637,-4553,2675,-4543,2699,-4520,2721,-4488,2730,-4444,2699,-4382,2586,-4309,2433,-4246,2335,-4201,2334,-4166,2389,-4132,2467,-4098,2567,-4065,2691,-4023,2807,-3966,2918,-3900,3021,-3841,3077,-3795,3047,-3756,2970,-3723,2922,-3700,2935,-3684,2977,-3669,3029,-3654,3091,-3640,3162,-3618,3223,-3583,3271,-3540,3308,-3494,3327,-3451,3327,-3406,3309,-3349,3267,-3275,3191,-3189,3091,-3094,3000,-2980,2936,-2857,2880,-2756,2811,-2693,2721,-2653,2617,-2626,2506,-2609,2385,-2604,2257,-2615,2134,-2662,2005,-2724,1880,-2740,1806,-2655,1842,-2524,1929,-2445,1933,-2474,1764,-2555,1513,-2619,1315,-2640,1238,-2643,1214,-2641,1178,-2636,1103,-2625,1017,-2612,935,-2597,865,-2579,799,-2565,737,-2556,678,-2550,623,-2556,569,-2580,514,-2615,460,-2641,411,-2665,365,-2680,325,-2641,296,-2523,205,-2351,125,-2147,296,-1879,958,-1578,1870,-1362,2548,-1295,2749,-1312,2717,-1335,2699,-1336,2787,-1343,2890,-1357,2978,-1380,3039,-1409,3086,-1445,3129,-1486,3171,-1532,3209,-1582,3255,-1646,3317,-1714,3387,-1750,3453,-1740,3494,-1699,3530,-1633,3621,-1530,3825,-1403,4083,-1293,4277,-1223,4356,-1170,4373,-1114,4361,-1047,4326,-978,4263,-909,4193,-841,4115,-774,4030,-711,3957,-648,3900,-589,3855,-551,3831,-547,3836,-565,3861,-583,3894,-596,3935,-610,3982,-622,4023,-644,4052,-664,4074,-651,4095,-575,4111,-467,4125,-379,4154,-334,4205,-310,4271,-291,4343,-278,4423,-271,4510,-256,4596,-246,4669,-228,4742,-154,4848,30,5014,270,5213,460,5405,534,5563,556,5714,619,5890,779,6129,979,6394,1134,6611,1202,6738,1225,6817,1240,6897,1262,6995,1276,7095,1281,7196,1276,7297,1261,7399,1236,7502,1192,7616,1137,7730,1090,7812,1070,7845,1058,7845,1012,7833,901,7807,757,7769,640,7743,578,7738,543,7747,505,7763,453,7792,399,7829,346,7858,300,7875,255,7883,203,7881,134,7867,57,7844]},
{n:"Lefkada",l:[-946,-4527],p:[-2083,-2174,-2131,-2099,-2182,-2015,-2239,-1910,-2308,-1759,-2382,-1587,-2445,-1465,-2489,-1415,-2521,-1414,-2541,-1465,-2557,-1537,-2560,-1660,-2537,-1929,-2472,-2468,-2379,-3153,-2284,-3708,-2186,-4007,-2086,-4176,-2010,-4318,-1980,-4449,-1975,-4553,-1948,-4691,-1875,-4919,-1782,-5181,-1700,-5376,-1645,-5442,-1601,-5441,-1561,-5451,-1522,-5496,-1486,-5552,-1442,-5631,-1384,-5751,-1318,-5894,-1253,-6018,-1198,-6101,-1144,-6165,-1080,-6232,-999,-6312,-907,-6394,-809,-6468,-694,-6538,-573,-6600,-484,-6635,-450,-6632,-449,-6602,-450,-6569,-447,-6540,-445,-6507,-427,-6475,-382,-6454,-321,-6434,-253,-6394,-176,-6321,-92,-6227,-27,-6131,8,-6037,23,-5942,34,-5848,39,-5757,39,-5669,48,-5586,80,-5513,120,-5444,141,-5376,124,-5302,88,-5228,62,-5159,57,-5096,62,-5038,70,-4983,83,-4930,100,-4879,115,-4831,126,-4784,135,-4739,141,-4691,145,-4636,147,-4580,147,-4530,146,-4493,142,-4464,134,-4434,130,-4413,121,-4390,80,-4324,-23,-4176,-158,-3985,-263,-3832,-309,-3756,-324,-3718,-329,-3682,-330,-3635,-321,-3589,-303,-3553,-272,-3525,-232,-3506,-197,-3508,-171,-3539,-150,-3591,-128,-3649,-107,-3715,-85,-3787,-60,-3853,-25,-3923,13,-3987,42,-4003,57,-3971,63,-3891,62,-3730,52,-3423,35,-3035,16,-2735,-4,-2600,-27,-2552,-53,-2525,-82,-2493,-114,-2482,-147,-2500,-182,-2568,-218,-2664,-253,-2735,-292,-2755,-330,-2750,-353,-2735,-353,-2720,-340,-2696,-322,-2648,-297,-2554,-268,-2437,-253,-2357,-260,-2345,-280,-2372,-310,-2402,-359,-2434,-418,-2471,-461,-2483,-474,-2450,-472,-2394,-471,-2345,-478,-2315,-488,-2292,-498,-2271,-509,-2252,-520,-2234,-530,-2211,-530,-2171,-528,-2125,-551,-2105,-617,-2135,-707,-2190,-796,-2228,-878,-2230,-958,-2213,-1026,-2185,-1082,-2145,-1124,-2094,-1143,-2037,-1123,-1973,-1079,-1904,-1045,-1843,-1032,-1794,-1030,-1754,-1045,-1728,-1088,-1722,-1148,-1730,-1200,-1744,-1237,-1761,-1266,-1783,-1289,-1812,-1304,-1846,-1313,-1886,-1312,-1932,-1286,-1990,-1250,-2054,-1253,-2105,-1328,-2119,-1440,-2120,-1539,-2156,-1600,-2274,-1647,-2426,-1704,-2520,-1783,-2505,-1872,-2432,-1948,-2357,-2000,-2300,-2040,-2241]},
{n:"Itaca",l:[-636,1025],p:[122,1858,160,1874,194,1892,232,1915,278,1949,346,2003,428,2073,504,2139,550,2184,560,2198,546,2193,516,2181,480,2174,429,2164,361,2147,297,2146,261,2184,261,2282,285,2423,320,2570,349,2684,370,2754,389,2800,411,2833,441,2862,488,2887,546,2904,602,2919,640,2940,663,2972,677,3010,673,3047,640,3077,564,3096,455,3108,338,3119,239,3132,167,3154,106,3180,51,3202,-3,3214,-54,3218,-100,3216,-147,3201,-200,3165,-270,3096,-350,3000,-421,2902,-461,2825,-453,2781,-410,2755,-366,2733,-353,2699,-385,2649,-442,2590,-509,2527,-569,2463,-616,2404,-660,2348,-706,2279,-759,2184,-830,2040,-912,1861,-990,1686,-1045,1555,-1070,1492,-1074,1471,-1071,1458,-1072,1414,-1081,1324,-1091,1208,-1101,1091,-1111,995,-1120,929,-1128,878,-1139,838,-1154,800,-1175,768,-1201,742,-1231,719,-1264,694,-1302,668,-1346,642,-1389,614,-1427,583,-1460,549,-1491,512,-1515,471,-1526,422,-1524,354,-1511,271,-1487,198,-1454,159,-1405,175,-1341,227,-1276,284,-1221,314,-1183,314,-1153,298,-1126,264,-1095,209,-1062,113,-1028,-16,-991,-139,-946,-218,-885,-237,-812,-219,-743,-181,-693,-139,-667,-92,-656,-35,-656,29,-661,92,-674,158,-696,228,-722,296,-747,357,-780,413,-819,465,-848,508,-849,537,-810,544,-741,535,-665,522,-601,519,-554,530,-514,547,-477,568,-441,590,-408,615,-377,643,-346,672,-313,699,-269,718,-220,733,-177,756,-154,800,-158,877,-182,976,-213,1083,-243,1180,-265,1258,-286,1327,-314,1403,-355,1499,-426,1636,-517,1801,-601,1957,-651,2071,-652,2124,-623,2138,-580,2136,-541,2140,-507,2154,-471,2167,-434,2178,-395,2188,-355,2194,-314,2199,-271,2202,-229,2203,-182,2202,-131,2201,-86,2196,-55,2184,-38,2163,-32,2135,-37,2103,-55,2071,-102,2035,-173,1995,-234,1958,-253,1933,-205,1926,-112,1932,-16,1938,42,1933,39,1906,1,1866,-41,1828,-55,1806,-29,1805,18,1818,73,1838]},
{n:"Preveza",l:[261,-9219],p:[935,-10306,913,-10267,887,-10231,858,-10199,829,-10171,801,-10148,771,-10130,742,-10113,713,-10094,685,-10073,658,-10052,632,-10027,609,-9996,595,-9946,586,-9885,574,-9830,550,-9803,504,-9822,442,-9872,382,-9922,342,-9942,329,-9915,333,-9861,344,-9801,353,-9753,357,-9723,361,-9701,366,-9683,374,-9669,385,-9660,397,-9656,412,-9655,432,-9656,444,-9672,453,-9700,480,-9711,550,-9677,689,-9570,877,-9412,1070,-9249,1224,-9127,1327,-9064,1403,-9033,1460,-9014,1509,-8990,1546,-8957,1569,-8924,1584,-8892,1597,-8860,1611,-8825,1621,-8790,1628,-8757,1629,-8729,1626,-8707,1617,-8690,1604,-8677,1585,-8671,1563,-8669,1536,-8673,1502,-8683,1459,-8702,1407,-8733,1347,-8773,1278,-8817,1198,-8857,1095,-8897,974,-8938,858,-8974,771,-8998,725,-9006,706,-9004,697,-8996,679,-8986,647,-8974,609,-8958,575,-8941,550,-8923,543,-8907,548,-8892,552,-8872,543,-8842,517,-8795,480,-8736,438,-8676,397,-8623,353,-8575,307,-8529,262,-8493,225,-8479,197,-8492,175,-8527,157,-8571,141,-8614,129,-8656,121,-8701,112,-8746,98,-8786,75,-8821,49,-8853,20,-8883,-8,-8911,-34,-8938,-62,-8964,-87,-8988,-108,-9013,-124,-9037,-136,-9062,-146,-9086,-154,-9112,-160,-9139,-163,-9169,-166,-9197,-171,-9221,-178,-9240,-186,-9255,-195,-9269,-204,-9281,-212,-9292,-221,-9302,-230,-9311,-237,-9321,-243,-9330,-249,-9339,-253,-9351,-253,-9368,-250,-9394,-243,-9427,-233,-9461,-222,-9490,-206,-9512,-188,-9531,-169,-9548,-151,-9564,-133,-9579,-114,-9592,-97,-9604,-83,-9618,-69,-9619,-56,-9612,-49,-9623,-55,-9677,-80,-9801,-118,-9976,-162,-10155,-201,-10293,-270,-10380,-360,-10437,-404,-10476,-335,-10504,983,-10504,1068,-10467,1048,-10414,983,-10356]},
{n:"",p:[5207,-10440,5192,-10414,5176,-10384,5162,-10352,5152,-10320,5147,-10290,5145,-10260,5147,-10229,5153,-10197,5171,-10160,5198,-10120,5219,-10085,5218,-10067,5184,-10074,5128,-10099,5067,-10128,5020,-10145,4993,-10146,4976,-10138,4963,-10127,4948,-10118,4934,-10117,4922,-10120,4905,-10115,4873,-10089,4808,-10035,4720,-9959,4644,-9877,4614,-9803,4677,-9732,4801,-9658,4908,-9598,4919,-9564,4778,-9567,4538,-9598,4288,-9640,4118,-9677,4066,-9710,4079,-9744,4112,-9777,4118,-9803,4086,-9818,4039,-9824,3988,-9831,3940,-9845,3896,-9869,3852,-9900,3809,-9933,3769,-9964,3732,-9996,3696,-10029,3663,-10059,3636,-10083,3618,-10102,3607,-10117,3595,-10125,3573,-10124,3537,-10105,3492,-10073,3444,-10043,3401,-10028,3363,-10034,3326,-10052,3292,-10078,3261,-10109,3233,-10145,3207,-10188,3184,-10233,3164,-10277,3149,-10323,3137,-10371,3129,-10413,3125,-10443,3128,-10454,3135,-10450,3145,-10443,3154,-10443,3114,-10456,3042,-10474,3035,-10492,3187,-10504,5262,-10504,5398,-10494,5367,-10480,5270,-10462]},
{n:"Kalamos",l:[2892,-2619],p:[3370,-2934,3384,-2896,3395,-2848,3398,-2795,3388,-2743,3360,-2690,3319,-2634,3271,-2580,3225,-2531,3181,-2489,3136,-2452,3090,-2417,3041,-2383,2989,-2349,2932,-2315,2878,-2285,2831,-2259,2794,-2241,2764,-2230,2736,-2219,2708,-2207,2680,-2193,2653,-2180,2624,-2163,2592,-2138,2554,-2102,2512,-2058,2469,-2009,2430,-1959,2397,-1903,2367,-1840,2339,-1782,2310,-1740,2279,-1713,2247,-1697,2217,-1694,2193,-1704,2174,-1733,2159,-1779,2150,-1832,2146,-1884,2144,-1927,2146,-1969,2158,-2020,2186,-2091,2237,-2195,2307,-2323,2382,-2452,2451,-2561,2509,-2643,2563,-2711,2618,-2767,2675,-2815,2735,-2851,2795,-2875,2859,-2893,2930,-2913,3016,-2938,3113,-2963,3205,-2984,3275,-2994,3318,-2992,3343,-2981,3358,-2962]},
{n:"Meganisi",l:[885,-3097],p:[1240,-3237,1247,-3226,1250,-3209,1249,-3189,1245,-3168,1237,-3146,1225,-3122,1211,-3097,1195,-3071,1179,-3046,1161,-3021,1141,-2995,1119,-2968,1098,-2939,1079,-2909,1050,-2879,1002,-2851,919,-2827,811,-2805,705,-2781,628,-2747,588,-2700,569,-2643,568,-2584,581,-2531,615,-2486,670,-2443,730,-2404,779,-2367,817,-2332,851,-2299,879,-2270,900,-2246,911,-2229,913,-2220,914,-2211,924,-2199,944,-2185,971,-2169,1001,-2150,1032,-2123,1072,-2079,1119,-2023,1156,-1972,1168,-1943,1152,-1935,1115,-1941,1058,-1968,980,-2023,868,-2116,725,-2240,581,-2376,466,-2507,383,-2634,319,-2765,274,-2887,252,-2988,260,-3063,293,-3119,341,-3162,389,-3197,438,-3217,492,-3223,551,-3228,615,-3245,691,-3283,777,-3334,859,-3382,921,-3409,957,-3406,975,-3383,986,-3354,999,-3332,1016,-3318,1031,-3306,1046,-3296,1062,-3292,1080,-3294,1099,-3303,1118,-3312,1133,-3317,1145,-3315,1154,-3310,1161,-3303,1165,-3294,1163,-3281,1158,-3265,1152,-3249,1151,-3238,1154,-3232,1161,-3230,1171,-3229,1181,-3230,1195,-3232,1212,-3237,1229,-3240]},
{n:"Kastos",l:[2641,-1170],p:[2900,-1641,2849,-1554,2809,-1480,2779,-1411,2755,-1344,2745,-1271,2746,-1197,2745,-1132,2729,-1087,2687,-1066,2629,-1063,2571,-1071,2531,-1087,2504,-1095,2484,-1102,2487,-1136,2531,-1224,2641,-1408,2800,-1660,2964,-1910,3086,-2082,3159,-2158,3206,-2176,3225,-2153,3216,-2105,3165,-2019,3075,-1893,2977,-1757]},
{n:"",p:[5448,1604,5420,1578,5389,1545,5359,1507,5332,1466,5310,1423,5291,1377,5275,1328,5260,1277,5245,1219,5232,1155,5222,1096,5218,1052,5224,1029,5237,1020,5252,1017,5263,1015,5269,1012,5275,1014,5282,1010,5287,996,5289,974,5290,943,5295,918,5309,915,5339,946,5379,1001,5421,1059,5455,1102,5479,1111,5498,1100,5513,1100,5524,1138,5524,1639,5511,1670,5493,1661,5471,1633]},
{n:"",p:[2189,-10491,2176,-10471,2158,-10444,2142,-10412,2136,-10376,2141,-10331,2154,-10279,2173,-10230,2198,-10193,2233,-10175,2278,-10169,2323,-10167,2358,-10158,2397,-10137,2439,-10111,2456,-10086,2423,-10070,2300,-10063,2112,-10063,1928,-10068,1819,-10079,1822,-10097,1892,-10123,1980,-10152,2037,-10181,2047,-10209,2038,-10239,2023,-10271,2012,-10306,2009,-10351,2008,-10402,2007,-10449,2006,-10484,1999,-10500,1989,-10505,1999,-10504,2212,-10504,2224,-10504,2217,-10505,2203,-10502]},
{n:"",p:[-492,10328,-411,10331,-312,10354,-219,10384,-154,10409,-128,10425,-128,10440,-138,10454,-144,10467,-130,10479,-109,10490,-105,10499,-143,10505,-680,10505,-688,10467,-641,10412,-567,10359]},
{n:"",p:[5494,2751,5450,2743,5389,2730,5334,2715,5309,2699,5330,2680,5380,2658,5437,2637,5479,2620,5500,2603,5512,2588,5519,2580,5524,2587,5524,2752,5522,2765,5513,2759]},
{n:"",p:[5364,-10504,5524,-10504,5524,-10344]},
{n:"",p:[5472,2269,5455,2287,5434,2312,5418,2328,5416,2321,5434,2271,5466,2192,5501,2116,5524,2077,5524,2238,5515,2254,5502,2260,5487,2262]},
{n:"Skorpios",l:[433,-3875],p:[441,-3982,449,-3981,455,-3978,460,-3975,464,-3971,469,-3967,473,-3962,478,-3955,482,-3951,486,-3946,489,-3941,492,-3936,495,-3930,497,-3924,499,-3918,500,-3911,501,-3901,501,-3891,500,-3882,500,-3873,500,-3863,501,-3853,501,-3845,502,-3838,501,-3830,501,-3821,499,-3814,496,-3807,493,-3801,488,-3796,483,-3793,477,-3791,469,-3790,460,-3792,453,-3794,446,-3796,439,-3798,430,-3797,421,-3797,414,-3799,407,-3802,400,-3807,395,-3813,391,-3818,388,-3824,385,-3829,383,-3835,380,-3841,377,-3847,374,-3854,372,-3860,370,-3868,369,-3875,369,-3883,370,-3890,371,-3898,374,-3904,378,-3910,382,-3915,386,-3920,391,-3924,397,-3929,402,-3934,407,-3940,410,-3945,413,-3953,417,-3959,420,-3965,424,-3971,428,-3975,433,-3979,439,-3981]}
],marks:[
{n:"Nydri",x:153,y:-4131},
{n:"Spartochori",x:1111,y:-3485},
{n:"Vathy Itaca",x:448,y:2370},
{n:"Fiskardo",x:-1854,y:511},
{n:"Sivota",x:-391,y:-2024},
{n:"Palairos",x:2084,y:-5538}
],ports:[
{n:"Preveza",x:303,y:-8257},
{n:"Palairos",x:2111,y:-5386},
{n:"Mytikas",x:2426,y:-4089},
{n:"Nydri",x:231,y:-3682},
{n:"Vathy Meganisi",x:1145,y:-3553},
{n:"Vasiliki",x:-1798,y:-2176},
{n:"Sivota",x:-300,y:-2127},
{n:"Kalamos",x:2723,y:-1945},
{n:"Astakos",x:5144,y:-428},
{n:"Kioni",x:-190,y:496},
{n:"Fiskardo",x:-1816,y:506},
{n:"Vathy Itaca",x:-307,y:1772},
{n:"Assos",x:-2868,y:2130},
{n:"Sami",x:-1125,y:4090},
{n:"Argostoli",x:-3610,y:5973},
{n:"Poros",x:1001,y:6032}
]};

let world=null;

function mkIsland(pts,name){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let i=0;i<pts.length;i+=2){
    if(pts[i]<x0)x0=pts[i]; if(pts[i]>x1)x1=pts[i];
    if(pts[i+1]<y0)y0=pts[i+1]; if(pts[i+1]>y1)y1=pts[i+1];
  }
  const hw=clamp(Math.min(x1-x0,y1-y0)*0.13,18,150);   // ampiezza delle secche
  return {n:name||"",l:null,p:pts,x0,y0,x1,y1,hw};
}

/* Distanza con segno dalla costa: positiva a terra, negativa in mare.
   Serve sia per l'incaglio sia per posizionare le boe.                 */
function landDepth(islands,x,y){
  let best=-1e9;
  for(const is of islands){
    if(x<is.x0-400||x>is.x1+400||y<is.y0-400||y>is.y1+400) continue;
    const p=is.p, n=p.length>>1;
    let d2=1e18, inside=false;
    for(let i=0,j=n-1;i<n;j=i++){
      const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
      const dx=xj-xi, dy=yj-yi;
      let t=((x-xi)*dx+(y-yi)*dy)/(dx*dx+dy*dy||1);
      t=t<0?0:(t>1?1:t);
      const ax=x-(xi+t*dx), ay=y-(yi+t*dy), dd=ax*ax+ay*ay;
      if(dd<d2) d2=dd;
    }
    const v=(inside?1:-1)*Math.sqrt(d2);
    if(v>best) best=v;
  }
  return best;
}
/* Direzione del mare aperto: gradiente della distanza dalla costa. */
function seaward(islands,x,y,e){
  e=e||4;
  const gx=landDepth(islands,x+e,y)-landDepth(islands,x-e,y);
  const gy=landDepth(islands,x,y+e)-landDepth(islands,x,y-e);
  const L=Math.hypot(gx,gy)||1;
  return {x:-gx/L,y:-gy/L};
}

/* Ombra di vento. Una costa alta ferma il vento per chilometri sottovento:
   nel Ionio vero è la cosa che decide una traversata. Per poterlo calcolare
   centinaia di volte per fotogramma approssimo ogni terra con pochi dischi,
   e proietto da ciascuno un cono che si allarga e si esaurisce col tempo.  */
function buildShade(islands){
  const shade=[];
  for(const is of islands){
    const mn=Math.min(is.x1-is.x0,is.y1-is.y0);
    const step=Math.max(80,mn/5);
    let got=0;
    for(let x=is.x0;x<=is.x1;x+=step)
      for(let y=is.y0;y<=is.y1;y+=step){
        const d=landDepth([is],x,y);
        if(d>step*0.35){
          const r=Math.min(d,step*1.5);
          shade.push({x,y,r,L:r*6.5+420});
          got++;
        }
      }
    if(!got){                                   // isolotti: un disco solo
      const r=Math.max(45,mn/2);
      shade.push({x:(is.x0+is.x1)/2,y:(is.y0+is.y1)/2,r,L:r*6.5+420});
    }
  }
  return shade;
}

function genWorld(seedStr){
  const rng=mulberry32(hashStr(seedStr));
  const SIZE=6000, islands=[], seeds=[];
  const target=13+Math.floor(rng()*7);
  let guard=0;
  while(islands.length<target && guard++<3000){
    const base=70+rng()*180;
    const x=(rng()-0.5)*(SIZE-base*3), y=(rng()-0.5)*(SIZE-base*3);
    if(Math.hypot(x,y)<520+base) continue;
    let ok=true;
    for(const sd of seeds){ if(Math.hypot(x-sd.x,y-sd.y)<sd.r+base+260){ok=false;break;} }
    if(!ok) continue;
    const N=46,p1=rng()*TAU,p2=rng()*TAU,p3=rng()*TAU;
    const a1=.20+rng()*.22, a2=.10+rng()*.16, a3=.05+rng()*.10;
    const pts=[];
    for(let i=0;i<N;i++){
      const t=i/N*TAU;
      const r=base*(1+a1*Math.sin(3*t+p1)+a2*Math.sin(5*t+p2)+a3*Math.sin(7*t+p3));
      const d=dv(t); pts.push(x+d.x*r, y+d.y*r);
    }
    seeds.push({x,y,r:base*1.55});
    islands.push(mkIsland(pts));
  }
  // ancoraggi: un punto al largo di ogni costa generata
  const ports=[{n:"Mare aperto",x:0,y:0}];
  islands.slice(0,8).forEach((is,k)=>{
    const n=is.p.length>>1, i=Math.floor(rng()*n);
    const vx=is.p[2*i], vy=is.p[2*i+1];
    const cx0=(is.x0+is.x1)/2, cy0=(is.y0+is.y1)/2;
    const dx=vx-cx0, dy=vy-cy0, L=Math.hypot(dx,dy)||1;
    ports.push({n:"Cala "+String.fromCharCode(65+k),x:Math.round(vx+dx/L*190),y:Math.round(vy+dy/L*190)});
  });
  const marks=[]; guard=0;
  while(marks.length<6 && guard++<5000){
    const a=(marks.length/6)*TAU+(rng()-0.5)*0.7, d=900+rng()*1700;
    const x=Math.sin(a)*d, y=-Math.cos(a)*d;
    if(landDepth(islands,x,y)>-140) continue;
    marks.push({x,y});
  }
  return {islands,marks,ports,shade:buildShade(islands),size:SIZE,start:{x:0,y:0},name:"Arcipelago \u201C"+seedStr+"\u201D"};
}

function ionianWorld(){
  const islands=IONIO.isl.map(o=>{const is=mkIsland(o.p.slice(),o.n);is.l=o.l||null;return is;});
  return {islands,marks:IONIO.marks.map(m=>({x:m.x,y:m.y,n:m.n})),
          ports:IONIO.ports.map(o=>({n:o.n,x:o.x,y:o.y})),shade:buildShade(islands),geo:IONIO.geo,
          size:IONIO.size,start:IONIO.start,name:"Mar Ionio"};
}

/* ══════════════════ stato ══════════════════ */
const boat={x:0,y:0,vx:0,vy:0,h:0,
  trim:45*D2R, jib:35*D2R,                      // scotte: randa e fiocco
  rudder:0, rudderCmd:0, yawRate:0,             // barra: comando e pala (con inerzia)
  boomSide:1, boomDraw:Math.PI, jibDraw:Math.PI, jibSide:1, butterfly:false,
  jibFurled:false, jibBack:false, spi:false, spiLimp:false, reef:0, stuck:0, gtime:0,
  wM:{opt:0,lo:0,hi:90*D2R,maxT:90*D2R}, wJ:{opt:0,lo:0,hi:80*D2R,maxT:80*D2R},
  heel:0, luff:0, luffJ:0, aoa:0, aoaJ:0, balance:0, beta:0, grounded:0, wake:[]};
const game={paused:false,auto:false,zoom:3.4,t:0,started:false,clock:0,next:0,done:null,
            msg:"",msgT:0, pilot:0, pilotTgt:0};
let windBase=7, windDirBase=200*D2R, gusts=[], streaks=[];
let assist=0.55;   // 0.55 = mare facile, 1 = pieno
let streakVis=1;   // visibilità dei tratteggi del vento
let timeScale=2;
let mapMode="ionio";   // scala del tempo: tutto accelera insieme, le proporzioni restano

function resetBoat(){
  boat.x=world.start.x;boat.y=world.start.y;boat.vx=0;boat.vy=0;
  // parte al lasco, ma dal lato con più acqua libera davanti
  const cand=[norm(windDirBase+Math.PI*0.62),norm(windDirBase-Math.PI*0.62)];
  let bh=cand[0], bs=-1e9;
  for(const h of cand){
    const d=dv(h);
    let worst=1e9;
    for(const r of [200,400,700]) worst=Math.min(worst,-landDepth(world.islands,boat.x+d.x*r,boat.y+d.y*r));
    if(worst>bs){bs=worst;bh=h;}
  }
  boat.h=bh;
  boat.trim=45*D2R;boat.jib=35*D2R;boat.rudder=0;boat.rudderCmd=0;boat.yawRate=0;
  boat.jibFurled=false;boat.jibBack=false;boat.spi=false;boat.reef=0;boat.stuck=0;boat.gtime=0;
  game.pilot=0;boat.wake.length=0;boat.grounded=0;
  game.clock=0;game.next=0;game.started=false;game.done=null;
  if(world.ports) startVoyage(nearestPort(boat.x,boat.y));
  say("Al via da "+(voy?voy.from:"—"));
}
function newWorld(seedStr){
  world=mapMode==="ionio"?ionianWorld():genWorld(seedStr);
  MARK_R=clamp(world.size/130,45,150);
  fillPorts();
  gusts=[];for(let i=0;i<14;i++)gusts.push(newGust(true));
  cam.x=boat.x;cam.y=boat.y;streaks=[];for(let i=0;i<160;i++)streaks.push(spawnStreak(true));
  resetBoat();
}
function newGust(anywhere){
  const d=dv(windDirBase+Math.PI);
  const cx=anywhere?boat.x+(Math.random()-.5)*2600:boat.x-d.x*1600+(Math.random()-.5)*1800;
  const cy=anywhere?boat.y+(Math.random()-.5)*2600:boat.y-d.y*1600+(Math.random()-.5)*1800;
  return {x:cx,y:cy,r:180+Math.random()*380,s:(0.14+Math.random()*0.32)*(0.5+assist*0.5),sh:(Math.random()-.5)*14*D2R*(0.5+assist*0.5),life:0};
}
function say(t){game.msg=t;game.msgT=3.2;}

/* campo di vento locale: base oscillante + raffiche */
let shadeDir={x:0,y:1};     // direzione in cui soffia, aggiornata una volta per fotogramma
function windAt(x,y){
  let from=windDirBase+Math.sin(game.t*0.07)*6*D2R+Math.sin(game.t*0.021+1.7)*4*D2R;
  let spd=windBase*(1+0.07*Math.sin(game.t*0.12+0.6));
  for(const g of gusts){
    const d=Math.hypot(x-g.x,y-g.y);
    if(d<g.r){const k=Math.cos(d/g.r*Math.PI/2); spd*=1+g.s*k; from+=g.sh*k;}
  }
  if(world&&world.shade){
    const dx0=shadeDir.x, dy0=shadeDir.y;
    let sh=0, lift=0;
    for(const c of world.shade){
      const dx=x-c.x, dy=y-c.y;
      const along=dx*dx0+dy*dy0;
      if(along<=0||along>c.L) continue;
      const across=Math.abs(-dx*dy0+dy*dx0);
      const w=c.r+along*0.22;
      if(across>w*1.35) continue;
      if(across<w){
        const v=(1-across/w)*(1-along/c.L);
        if(v>sh) sh=v;
      }else{
        const v=(1-(across-w)/(w*0.35))*(1-along/c.L);   // ai bordi il vento accelera
        if(v>lift) lift=v;
      }
    }
    if(sh>0) spd*=1-0.80*Math.pow(sh,0.75);
    else if(lift>0) spd*=1+0.14*lift;
  }
  return {from:norm(from),spd};
}

/* ══════════════════ fisica ══════════════════ */
/* Modello aerodinamico di una vela: identico per randa e fiocco, ma il fiocco
   ha un "solco" più stretto (stalla e fileggia prima), come un genoa vero. */
function sailAero(beta,trim,narrow){
  const alpha=Math.abs(beta)-trim;
  const c=aeroC(alpha,narrow);
  return {alpha,CL:c.CL,CD:c.CD,luff:c.luff};
}

/* Coefficienti di una vela in funzione dell'angolo d'attacco. */
function aeroC(alpha,narrow){
  if(alpha<=0) return {CL:0,CD:K.CD0*0.5,luff:0};
  const a=Math.min(alpha,Math.PI/2), stall=(narrow?25:30)*D2R;   // oltre i 90° è una lastra piatta
  let CL=K.CLmax*Math.sin(2*a);
  if(a>stall) CL*=Math.max(narrow?0.36:0.5,1-(a-stall)/((narrow?105:150)*D2R));
  let CD=K.CD0+K.CDmax*(1-Math.cos(2*a))/2;
  const luff=clamp(a/((narrow?9:7)*D2R),0,1);
  return {CL:CL*luff, CD:K.CD0+(CD-K.CD0)*luff, luff};
}

/* Spinta in avanti data dalla vela: CL·sin(beta) − CD·cos(beta).
   Cercando il massimo si scopre che l'angolo d'attacco migliore NON è fisso:
   vale ~27° di bolina e cresce fino a 90° in poppa, cioè la vela va tenuta
   via via più perpendicolare al vento man mano che si poggia.            */
function bestTrim(beta,maxT,narrow){
  const ab=Math.abs(beta), sb=Math.sin(ab), cb=Math.cos(ab), STEP=1.5*D2R;
  let best=-1e9, opt=0;
  for(let t=0;t<=maxT+1e-9;t+=STEP){
    const c=aeroC(ab-t,narrow), d=c.CL*sb-c.CD*cb;
    if(d>best){best=d;opt=t;}
  }
  const thr=best-Math.abs(best)*0.03;          // finestra al 97% della spinta
  let lo=maxT, hi=0;
  for(let t=0;t<=maxT+1e-9;t+=STEP){
    const c=aeroC(ab-t,narrow);
    if(c.CL*sb-c.CD*cb>=thr){if(t<lo)lo=t;if(t>hi)hi=t;}
  }
  if(hi<lo){lo=opt;hi=opt;}
  return {opt,lo,hi,maxT};
}
/* Polare teorico della barca: risolve l'equilibrio fra spinta velica e
   resistenza dello scafo senza far girare la simulazione. Serve come
   metro di paragone per il polare personale del giornale di bordo.   */
function polarSpeed(twaDeg,wind){
  const twa=Math.abs(twaDeg)*D2R;
  let vf=1.5, vl=0;
  for(let it=0;it<50;it++){
    const fx=wind*Math.cos(twa)+vf, fy=wind*Math.sin(twa)+vl;   // da dove viene, assi barca
    const As=Math.hypot(fx,fy);
    const beta=Math.atan2(fy,fx), ab=Math.abs(beta), sg=beta>=0?1:-1;
    const wm=bestTrim(beta,90*D2R,false), wj=bestTrim(beta,80*D2R,true);
    const cm=aeroC(ab-wm.opt,false), cj=aeroC(ab-wj.opt,true);
    let je=ab<105*D2R?1:lerp(1,0.34,clamp((ab-105*D2R)/(70*D2R),0,1));
    if(ab>145*D2R&&wj.opt>62*D2R) je=0.95;                          // fiocco a farfalla
    const q=As*As;
    const drv=c=>c.CL*Math.sin(ab)-c.CD*Math.cos(ab);
    const lat=c=>c.CL*Math.cos(ab)+c.CD*Math.sin(ab);
    let Ff=q*(K.SAIL_MAIN*drv(cm)+K.SAIL_JIB*je*drv(cj));
    let Fl=-sg*q*(K.SAIL_MAIN*lat(cm)+K.SAIL_JIB*je*lat(cj));
    const spill=1-0.35*Math.pow(clamp(Math.abs(Fl)/9000,0,1),2);   // sbandamento che sfoga
    Ff*=spill; Fl*=spill;
    let lo=0,hi=9;
    for(let k=0;k<34;k++){
      const m=(lo+hi)/2, x=Math.pow(m/K.VHULL,12), wv=1+K.WAVE*x/(1+x);
      if(K.HULL_F*m*m*wv+K.LIN_F*m<Ff) lo=m; else hi=m;
    }
    let l2=0,h2=4, aF=Math.abs(Fl);
    for(let k=0;k<28;k++){const m=(l2+h2)/2; if(K.HULL_L*m*m+K.LIN_L*m<aF) l2=m; else h2=m;}
    vf+=((lo+hi)/2-vf)*0.5;
    vl+=(Math.sign(Fl)*(l2+h2)/2-vl)*0.5;                          // scarroccio
  }
  return Math.max(0,Math.hypot(vf,vl));
  return Math.max(0,v);
}

function trimWindows(){
  boat.wM=bestTrim(boat.beta,90*D2R,false);
  boat.wJ=bestTrim(boat.beta,boat.spi?90*D2R:80*D2R,true);
}

/* Stato di regolazione di una vela. Tiene conto dei limiti della scotta:
   se sei già tutto lascato e il vento è in poppa non c'è nulla da correggere,
   la spinta per resistenza è il massimo ottenibile a quell'andatura.        */
function trimState(beta,trim,W,aback){
  if(aback) return "collo";
  const ab=Math.abs(beta), a=ab-trim, m=2*D2R;
  if(trim<=0.6*D2R && ab<22*D2R) return "stretta";     // prua troppo al vento: la scotta non basta
  if(a<7*D2R)          return "fileggia";              // vela che sbatte
  if(trim>W.hi+m)      return "lasca";                 // oltre la finestra: poca spinta
  if(trim<W.lo-m)      return trim<W.lo-14*D2R?"stallo":"cazzata";
  if(W.hi>=W.maxT-1*D2R && trim>=W.maxT-1*D2R) return "aperta";
  return "ottima";
}

/* Vela messa a collo: tenuta dal lato sopravvento. L'angolo d'attacco
   diventa |beta| + angolo di scotta, quindi tanta resistenza: spinge la
   prua sottovento e la barca all'indietro. È il modo di uscire dalla panne. */
function sailAback(beta,trim){
  const a=Math.min(Math.abs(beta)+trim,Math.PI/2);
  return {alpha:a, CL:K.CLmax*Math.sin(2*a)*0.85,
          CD:K.CD0+K.CDmax*(1-Math.cos(2*a))/2, luff:1, aback:true};
}

function physics(dt){
  const w=windAt(boat.x,boat.y);
  const wv=dv(w.from+Math.PI);
  const Ax=wv.x*w.spd-boat.vx, Ay=wv.y*w.spd-boat.vy;     // vento apparente (verso cui soffia)
  const As=Math.hypot(Ax,Ay);
  const flow=angOf(Ax,Ay);
  const beta=norm(norm(flow+Math.PI)-boat.h);             // angolo vento apparente / prua
  const sgn=beta>=0?1:-1, ab=Math.abs(beta);
  boat.beta=beta;
  if(game.auto){
    boat.trim=boat.wM.opt;
    if(!boat.jibBack) boat.jib=boat.wJ.opt;
  }

  const m=sailAero(beta,boat.trim,false);
  const jibUp=boat.spi||!boat.jibFurled;
  const backed=boat.jibBack&&jibUp&&!boat.spi;
  const headArea=boat.spi?K.SAIL_SPI:K.SAIL_JIB;
  const j = backed ? sailAback(beta,boat.jib) : sailAero(beta,boat.jib,true);
  boat.aoa=m.alpha; boat.aoaJ=j.alpha;
  boat.stM=trimState(beta,boat.trim,boat.wM,false);
  boat.stJ=boat.spi?(boat.spiLimp?"sventato":trimState(beta,boat.jib,boat.wJ,false))
           :(boat.jibFurled?"avvolto":trimState(beta,boat.jib,boat.wJ,backed));
  boat.luff=1-m.luff; boat.luffJ=jibUp?1-j.luff:0;

  // il fiocco resta coperto dalla randa alle andature portanti,
  // a meno che non lo si porti dall'altro lato: a farfalla
  boat.butterfly = jibUp && !boat.spi && !backed && ab>145*D2R && boat.jib>62*D2R;
  let jibEff;
  if(boat.spi){
    // lo spinnaker si gonfia solo con il vento abbastanza aperto, e resta
    // molto meno coperto dalla randa perché lavora proiettato fuori bordo
    jibEff=clamp((ab-60*D2R)/(26*D2R),0,1);
    jibEff*=ab<115*D2R?1:lerp(1,0.78,clamp((ab-115*D2R)/(65*D2R),0,1));
    boat.spiLimp=ab<66*D2R;
  }else{
    jibEff = ab<105*D2R ? 1 : lerp(1,0.34,clamp((ab-105*D2R)/(70*D2R),0,1));
    if(boat.butterfly) jibEff=0.95;
    if(backed) jibEff=1;
    if(!jibUp) jibEff=0;
    boat.spiLimp=false;
  }
  // effetto solco: le due vele ben regolate insieme rendono più della somma
  const inGroove=x=>x>7*D2R&&x<26*D2R;
  const slot=(jibUp&&!backed&&!boat.spi&&inGroove(m.alpha)&&inGroove(j.alpha))?1.08:1;

  const q=As*As;
  const mainArea=K.SAIL_MAIN*K.REEF[boat.reef];
  const Lm=q*mainArea*m.CL*slot, Dm=q*mainArea*m.CD;
  const Lj=q*headArea*j.CL*jibEff, Dj=q*headArea*j.CD*jibEff;
  const ld=dv(flow+sgn*Math.PI/2), fd=dv(flow);
  const fwd=dv(boat.h), lat=dv(boat.h+Math.PI/2);
  const proj=(L,D)=>{
    const Fx=L*ld.x+D*fd.x, Fy=L*ld.y+D*fd.y;
    return {f:Fx*fwd.x+Fy*fwd.y, l:Fx*lat.x+Fy*lat.y};
  };
  const Fm=proj(Lm,Dm), Fj=proj(Lj,Dj);
  let Ff=Fm.f+Fj.f, Fl=Fm.l+Fj.l;

  // momento di imbardata: la randa tira a poppavia del centro di deriva
  // (fa orzare), il fiocco a proravia (fa puggiare)
  const Tm=Fm.l*K.ARM_M, Tj=Fj.l*K.ARM_J;
  boat.balance=clamp((Tj-Tm)*sgn/(Math.abs(Tm)+Math.abs(Tj)+40),-1,1);

  const heelT=clamp(Math.abs(Fl)/9000,0,1);
  boat.heel=lerp(boat.heel,clamp(Fl/9000,-1,1),1-Math.exp(-3*dt));
  const spill=1-0.35*heelT*heelT;                            // troppo sbandata = vento sfogato
  Ff*=spill; Fl*=spill;

  let vf=boat.vx*fwd.x+boat.vy*fwd.y, vl=boat.vx*lat.x+boat.vy*lat.y;
  const x=Math.pow(Math.abs(vf)/K.VHULL,12), wave=1+K.WAVE*x/(1+x);   // muro dell'onda
  const Hf=-Math.sign(vf)*K.HULL_F*vf*vf*wave-K.LIN_F*vf;
  const Hl=-Math.sign(vl)*K.HULL_L*vl*vl-K.LIN_L*vl;
  const drag=boat.grounded>0?0.55:1;                          // incagliato: si striscia
  vf+=(Ff*drag+Hf)/K.MASS*dt;
  vl+=(Fl*drag+Hl)/K.MASS*dt;
  boat.vx=vf*fwd.x+vl*lat.x; boat.vy=vf*fwd.y+vl*lat.y;

  // ─ barra: la pala insegue il comando con la sua inerzia
  boat.rudder+=(boat.rudderCmd-boat.rudder)*(1-Math.exp(-dt/0.30));
  // le vele imbardano; alle andature veloci lo scafo tiene la rotta molto meglio
  // Senza abbrivio la deriva non ha presa: la barca scarroccia invece di ruotare.
  // Il fiocco a collo fa eccezione, perché spinge la prua di forza anche da fermo.
  const yawSpd=backed?1:clamp(0.20+Math.abs(vf)*0.55,0,1);
  const yawSail=(Tj-Tm)*K.YAW*assist*yawSpd/(1+Math.abs(vf)*0.35);
  boat.yawSail=yawSail*R2D;   // °/s dovuti alle sole vele
  // La pala morde in proporzione all'acqua che le scorre sopra: con abbrivio
  // la barca risponde bene, quasi ferma non risponde quasi per niente.
  const av=Math.abs(vf), sv=Math.sign(vf);
  const rEff=sv*(Math.min(av,3.6)+1.0*clamp((av-0.7)/0.5,0,1));
  const yawTgt=boat.rudder*rEff*K.RUDDER+yawSail;
  boat.yawRate+=(yawTgt-boat.yawRate)*(1-Math.exp(-dt/K.YAWTAU));   // massa che ruota
  boat.h=norm(boat.h+boat.yawRate*dt);

  // il fiocco a collo si libera da solo quando la prua è caduta
  if(backed && ab>65*D2R && Math.hypot(boat.vx,boat.vy)>1.0){
    boat.jibBack=false; say("Prua caduta — fiocco liberato");
  }
  // riconosce la panne e suggerisce la manovra
  const spNow=Math.hypot(boat.vx,boat.vy);
  if(spNow<0.35 && ab<52*D2R){
    boat.stuck+=dt;
    if(boat.stuck>3 && game.msgT<=0)
      say(jibUp?"In panne — premi B: fiocco a collo per far cadere la prua":"In panne — issa il fiocco (F) e mettilo a collo (B)");
  } else boat.stuck=0;
  boat.x+=boat.vx*dt; boat.y+=boat.vy*dt;

  // boma e fiocco sul lato sottovento (a farfalla, o a collo sopravvento)
  if(ab>4*D2R) boat.boomSide=sgn;
  boat.jibSide=(boat.butterfly||backed)?-boat.boomSide:boat.boomSide;
  const tgtM=Math.PI+boat.trim*boat.boomSide, tgtJ=Math.PI+boat.jib*boat.jibSide;
  boat.boomDraw+=norm(tgtM-boat.boomDraw)*(1-Math.exp(-9*dt));
  boat.jibDraw +=norm(tgtJ-boat.jibDraw )*(1-Math.exp(-7*dt));

  // ─ collisione con la terra
  const dep=landDepth(world.islands,boat.x,boat.y);
  if(dep>-2){
    const nv=seaward(world.islands,boat.x,boat.y);
    const nx=nv.x, ny=nv.y;
    boat.x+=nx*(dep+2)*Math.min(1,dt*10); boat.y+=ny*(dep+2)*Math.min(1,dt*10);
    const into=boat.vx*nx+boat.vy*ny;
    if(into<0){boat.vx-=into*nx*1.6;boat.vy-=into*ny*1.6;}
    const kd=Math.exp(-2.2*dt); boat.vx*=kd; boat.vy*=kd;   // attrito sul fondo, indipendente dal passo
    if(boat.grounded<=0) say("Incagliato! Lasca le vele e vira per liberarti");
    boat.grounded=0.8;
    boat.gtime+=dt;
  } else {boat.grounded=Math.max(0,boat.grounded-dt); boat.gtime=Math.max(0,boat.gtime-dt*2);}

  // ─ limite del mondo
  const R=world.size*0.52, d0=Math.hypot(boat.x,boat.y);
  if(d0>R){const k=(d0-R)/220;
    boat.vx-=boat.x/d0*k*dt*30; boat.vy-=boat.y/d0*k*dt*30;
    if(game.msgT<=0) say("Fuori dalle acque della carta — rientra");}

  // ─ scia
  const sp=Math.hypot(boat.vx,boat.vy);
  if(sp>0.25 && (boat.wake.length===0 || Math.hypot(boat.x-boat.wake[0].x,boat.y-boat.wake[0].y)>3.5))
    boat.wake.unshift({x:boat.x,y:boat.y,s:sp});
  if(boat.wake.length>90) boat.wake.pop();

  // ─ regata
  if(!game.started && sp>0.6){game.started=true;}
  if(game.started && !game.done) game.clock+=dt;
  if(!game.done && world.marks[game.next]){
    const mk=world.marks[game.next];
    if(Math.hypot(boat.x-mk.x,boat.y-mk.y)<MARK_R){
      game.next++;
      if(game.next>=world.marks.length){game.done=game.clock; say("Percorso completato in "+fmtT(game.clock));}
      else say((mk.n?mk.n+" girata":"Boa "+game.next+" girata")+" — avanti a "+(world.marks[game.next].n||("n° "+(game.next+1))));
    }
  }
}

/* Autotimoniere: 1 = mantiene la rotta bussola, 2 = mantiene l'angolo
   col vento apparente, come un autotimoniere a vento vero.            */
function autopilot(dt){
  if(!game.pilot)return;
  if(game.pilot===1){
    // richiamo elastico: la barra torna piano al centro se non la tieni
    const L=keys["arrowleft"]||keys["a"], R=keys["arrowright"]||keys["d"];
    if(!L&&!R) boat.rudderCmd-=boat.rudderCmd*Math.min(1,1.9*dt);
    return;
  }
  // un pilota che continua a governare con la barca ferma ti impedisce di ripartire
  if(boat.stuck>2){game.pilot=0;boat.rudderCmd=0;
    say("Autotimoniere disinserito: la barca è ferma, riprendi tu la barra");return;}
  let err;
  if(game.pilot===2) err=norm(game.pilotTgt-boat.h);
  else err=norm(boat.beta-game.pilotTgt);
  boat.rudderCmd=clamp(err*3.4-boat.yawRate*6.5,-1,1);
}
function fmtT(s){const m=Math.floor(s/60);return String(m).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0")+"."+String(Math.floor(s*10%10));}

/* ══════════════════ tratteggi del vento ══════════════════ */
/* Ogni tratteggio segue il vento LOCALE: dentro una raffica si allunga,
   si schiarisce, si ispessisce e accelera. Sono il modo principale per
   leggere forza e direzione senza guardare gli strumenti.            */
const SEG=3;
function viewRadius(){return Math.max(VW,VH)/2/game.zoom*1.35;}
function spawnStreak(anywhere){
  const R=viewRadius(), d=dv(windDirBase+Math.PI), n=dv(windDirBase+Math.PI/2);
  let x,y;
  if(anywhere){
    const a=Math.random()*TAU, r=Math.sqrt(Math.random())*R;
    x=cam.x+Math.cos(a)*r; y=cam.y+Math.sin(a)*r;
  }else{                                   // rientra dal bordo sopravvento
    const u=(Math.random()*2-1)*R*1.15;
    x=cam.x-d.x*R+n.x*u; y=cam.y-d.y*R+n.y*u;
  }
  return {x,y,dx:d.x,dy:d.y,len:20,b:0,spd:windBase,ph:Math.random()};
}
function updateWind(dt){
  shadeDir=dv(windDirBase+Math.PI);
  // raffiche alla deriva sottovento
  const gd=dv(windDirBase+Math.PI);
  for(let i=0;i<gusts.length;i++){
    const g=gusts[i];
    g.x+=gd.x*windBase*0.55*dt; g.y+=gd.y*windBase*0.55*dt; g.life+=dt;
    if(Math.hypot(g.x-cam.x,g.y-cam.y)>viewRadius()+2200) gusts[i]=newGust(false);
  }
  // densità adattata all'inquadratura
  const R=viewRadius();
  const target=clamp(Math.round(R*R*0.0027*(0.55+streakVis*0.45)),80,460);
  while(streaks.length<target) streaks.push(spawnStreak(streaks.length>0?false:true));
  while(streaks.length>target) streaks.pop();

  for(let i=0;i<streaks.length;i++){
    const s=streaks[i];
    const w=windAt(s.x,s.y);
    const d=dv(w.from+Math.PI);
    s.dx=d.x; s.dy=d.y;
    s.len=6+w.spd*2.5;                              // più vento = tratto più lungo
    const r=w.spd/windBase;                          // fascia relativa: 0 calma, 2 raffica piena
    s.b=r<1.06?0:(r<1.24?1:2);
    s.spd=w.spd;
    s.x+=d.x*w.spd*0.95*dt; s.y+=d.y*w.spd*0.95*dt; // e scorre più in fretta
    if(Math.hypot(s.x-cam.x,s.y-cam.y)>R*1.12) streaks[i]=spawnStreak(false);
  }
}

/* ══════════════════ input ══════════════════ */
const keys=Object.create(null);
function cyclePilot(){
  game.pilot=(game.pilot+1)%4;
  if(game.pilot===1) say("Barra con richiamo al centro — torna dritta se la molli");
  else if(game.pilot===2){game.pilotTgt=boat.h;say("Autotimoniere su ROTTA "+String(Math.round((boat.h*R2D+360)%360)).padStart(3,"0")+"°");}
  else if(game.pilot===3){
    const sg=boat.beta>=0?1:-1;
    let t=boat.beta;
    if(Math.abs(t)<38*D2R){t=sg*38*D2R;say("Autotimoniere a VENTO — 30° è dentro la zona morta, imposto 38°");}
    else say("Autotimoniere a VENTO — mantiene "+Math.round(Math.abs(t*R2D))+"° apparenti");
    game.pilotTgt=t;
  }
  else say("Autotimoniere disinserito — barra libera");
}
addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(["arrowleft","arrowright","arrowup","arrowdown"," "].includes(k))e.preventDefault();
  if(askEl.classList.contains("on")){
    if(k==="enter"||k==="y"||k==="s")askClose(true);
    else if(k==="escape"||k==="n")askClose(false);
    return;
  }
  if(e.repeat)return;
  keys[k]=1;
  if(k==="p")game.paused=!game.paused;
  if(k==="m")toggleMenu();
  if(k==="l")toggleLog();
  if(k==="c")toggleChart();
  if(k==="0"&&chart.on)chartFit();
  if(k==="h")toggleHelp();
  if(k==="r")askConfirm("Riportare la barca al via? La regata in corso e il cronometro ripartono da zero.",resetBoat);
  if(k==="z")cyclePilot();
  if(k==="x"){
    boat.reef=(boat.reef+1)%3;
    say(boat.reef?("Randa terzarolata: "+boat.reef+"ª mano, superficie al "+Math.round(K.REEF[boat.reef]*100)+"%")
                 :"Randa a tutto ferro");
  }
  if(k==="g"){
    boat.spi=!boat.spi;boat.jibBack=false;
    if(boat.spi){boat.jibFurled=true;boat.jib=clamp(boat.jib,30*D2R,90*D2R);
      say("Spinnaker a riva — vale solo alle andature portanti");}
    else{boat.jibFurled=false;boat.jib=clamp(boat.jib,0,80*D2R);say("Spinnaker ammainato, fiocco issato");}
  }
  if(k==="f"){boat.jibFurled=!boat.jibFurled;if(boat.jibFurled)boat.jibBack=false;
    say(boat.jibFurled?"Fiocco avvolto — la barca orza di più, lasca la randa":"Fiocco issato");}
  if(k==="b"){
    if(boat.jibFurled)say("Il fiocco è avvolto — premi F per issarlo");
    else{boat.jibBack=!boat.jibBack;say(boat.jibBack?"Fiocco a collo — la prua cade sottovento":"Fiocco liberato");}
  }
  if(k==="n"){document.getElementById("seed").value=Math.random().toString(36).slice(2,8);newWorld(document.getElementById("seed").value);}
  if(k==="t"){game.auto=!game.auto;say(game.auto?"Regolazione vele AUTOMATICA":"Regolazione vele manuale");}
  if(k==="+"||k==="=")game.zoom=clamp(game.zoom*1.25,1.1,9);
  if(k==="-"||k==="_")game.zoom=clamp(game.zoom/1.25,1.1,9);
  if(k===" "){boat.rudderCmd=0;if(game.pilot){game.pilot=0;say("Autotimoniere disinserito — barra al centro");}}
});
addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=0;});
addEventListener("blur",()=>{for(const k in keys)keys[k]=0;});

function input(dt){
  const L=keys["arrowleft"]||keys["a"], R=keys["arrowright"]||keys["d"];
  if(game.pilot>=2){
    // con l'autotimoniere inserito il timone corregge la ROTTA IMPOSTATA
    const r=26*D2R*dt;
    if(L&&!R) game.pilotTgt=norm(game.pilotTgt-r);
    if(R&&!L) game.pilotTgt=norm(game.pilotTgt+r);
  }else{
    // la barra resta dove la lasci (frizione inserita) e si muove con inerzia
    if(L&&!R) boat.rudderCmd=clamp(boat.rudderCmd-1.15*dt,-1,1);
    else if(R&&!L) boat.rudderCmd=clamp(boat.rudderCmd+1.15*dt,-1,1);
  }
  if(!game.auto){
    const rate=50*D2R*dt, both=!!keys["shift"];
    const IN=keys["arrowup"]||keys["w"], OUT=keys["arrowdown"]||keys["s"];
    if(IN){boat.trim=clamp(boat.trim-rate,0,90*D2R); if(both)boat.jib=clamp(boat.jib-rate,0,80*D2R);}
    if(OUT){boat.trim=clamp(boat.trim+rate,0,90*D2R); if(both)boat.jib=clamp(boat.jib+rate,0,80*D2R);}
    const mx=boat.spi?90*D2R:80*D2R;
    if(keys["q"])boat.jib=clamp(boat.jib-rate,0,mx);
    if(keys["e"])boat.jib=clamp(boat.jib+rate,0,mx);
  }
}
/* Rotelle del mouse: verticale = randa, orizzontale = fiocco.
   Funziona anche con lo scorrimento a due dita del trackpad.        */
let wheelInv=false;
addEventListener("wheel",e=>{
  if(e.target&&e.target.closest&&e.target.closest("#settings,#help,#ask,#tut,#showm"))return;
  if(helpEl.classList.contains("on")||askEl.classList.contains("on"))return;
  e.preventDefault();
  const u=e.deltaMode===1?16:(e.deltaMode===2?400:1);      // righe o pagine -> pixel
  if(chart.on){                                            // sulla carta: zoom sul cursore
    const p=c2w(e.offsetX!==undefined?e.offsetX:VW/2,e.offsetY!==undefined?e.offsetY:VH/2);
    const f=Math.pow(0.9988,e.deltaY*u);
    chart.z=clamp(chart.z*f,Math.min(VW,VH)*0.30/world.size,0.9);
    const q=c2w(e.offsetX!==undefined?e.offsetX:VW/2,e.offsetY!==undefined?e.offsetY:VH/2);
    chart.x+=p.x-q.x; chart.y+=p.y-q.y;
    return;
  }
  if(e.ctrlKey){                                           // ctrl+rotella = zoom della carta
    game.zoom=clamp(game.zoom*Math.pow(0.9988,e.deltaY*u),1.1,9);return;
  }
  if(game.paused||game.auto)return;
  const k=0.06*D2R*(wheelInv?-1:1);
  const dy=e.deltaY*u*k, dx=e.deltaX*u*k;
  const mx=boat.spi?90*D2R:80*D2R;
  if(dy){
    boat.trim=clamp(boat.trim+dy,0,90*D2R);
    if(e.shiftKey) boat.jib=clamp(boat.jib+dy,0,mx);       // shift: le due scotte insieme
  }
  if(dx) boat.jib=clamp(boat.jib+dx,0,mx);
},{passive:false});

if("ontouchstart" in window){
  document.body.classList.add("touch");
  document.querySelectorAll("#touch button").forEach(b=>{
    const k=b.dataset.k.toLowerCase();
    const on=e=>{e.preventDefault();keys[k]=1;}, off=e=>{e.preventDefault();keys[k]=0;};
    b.addEventListener("pointerdown",on);b.addEventListener("pointerup",off);
    b.addEventListener("pointercancel",off);b.addEventListener("pointerleave",off);
  });
}

/* ══════════════════ disegno ══════════════════ */
const cv=document.getElementById("cv"), ctx=cv.getContext("2d");
cv.addEventListener("pointerdown",e=>{ if(chart.on){chart.drag={x:e.offsetX,y:e.offsetY,cx:chart.x,cy:chart.y};cv.setPointerCapture(e.pointerId);} });
cv.addEventListener("pointermove",e=>{
  if(!chart.on)return;
  chart.mx=e.offsetX;chart.my=e.offsetY;
  if(chart.drag){chart.x=chart.drag.cx-(e.offsetX-chart.drag.x)/chart.z;
                 chart.y=chart.drag.cy-(e.offsetY-chart.drag.y)/chart.z;}
});
cv.addEventListener("pointerup",()=>{chart.drag=null;});
cv.addEventListener("pointerleave",()=>{chart.drag=null;chart.mx=0;});
let VW=0,VH=0,DPR=1;
function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  VW=innerWidth;VH=innerHeight;
  cv.width=VW*DPR;cv.height=VH*DPR;cv.style.width=VW+"px";cv.style.height=VH+"px";
}
addEventListener("resize",resize);resize();

const CSS=getComputedStyle(document.documentElement);
const C=n=>CSS.getPropertyValue(n).trim();

let cam={x:0,y:0};
function draw(){
  if(chart.on){drawChart();return;}
  const z=game.zoom;
  cam.x=lerp(cam.x,boat.x+boat.vx*8,0.12);
  cam.y=lerp(cam.y,boat.y+boat.vy*8,0.12);

  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=C("--sea");ctx.fillRect(0,0,VW,VH);

  ctx.save();
  ctx.translate(VW/2,VH/2);ctx.scale(z,z);ctx.translate(-cam.x,-cam.y);
  const hw=VW/2/z, hh=VH/2/z;
  const view={x0:cam.x-hw,x1:cam.x+hw,y0:cam.y-hh,y1:cam.y+hh};

  drawWater(view,z);
  drawGusts(z);
  drawStreaks(z);
  for(const is of world.islands) drawIsland(is,view,z);
  drawMarks(z);
  drawGhost();
  drawWake();
  drawBoat();
  ctx.restore();

  drawHUD();
  tutHighlight();
}

function drawWater(v,z){
  // trama d'onda deterministica per tessere
  const T=90;
  ctx.strokeStyle="rgba(255,255,255,.075)";ctx.lineWidth=1.4/z;
  ctx.beginPath();
  const wv=dv(windDirBase+Math.PI+Math.PI/2);
  for(let tx=Math.floor(v.x0/T);tx<=Math.floor(v.x1/T);tx++)
    for(let ty=Math.floor(v.y0/T);ty<=Math.floor(v.y1/T);ty++){
      let h=(Math.imul(tx,374761393)^Math.imul(ty,668265263))>>>0;
      for(let k=0;k<2;k++){
        h=Math.imul(h^h>>>13,1274126177)>>>0;
        const px=tx*T+(h%1000)/1000*T, py=ty*T+((h>>>10)%1000)/1000*T;
        const len=9+((h>>>20)%100)/100*13;
        const ph=Math.sin(game.t*1.6+px*0.05+py*0.03)*0.25;
        ctx.moveTo(px-wv.x*len*(1+ph),py-wv.y*len*(1+ph));
        ctx.lineTo(px+wv.x*len,py+wv.y*len);
      }
    }
  ctx.stroke();
}
function drawGusts(z){
  for(const g of gusts){
    const gr=ctx.createRadialGradient(g.x,g.y,g.r*0.25,g.x,g.y,g.r);
    gr.addColorStop(0,"rgba(4,26,40,.42)");gr.addColorStop(1,"rgba(4,26,40,0)");
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,TAU);ctx.fill();
  }
}
function drawStreaks(z){
  ctx.lineCap="round";
  for(let b=0;b<3;b++){
    const base=(0.175+b*0.115)*(0.72+windBase/16*0.56)*streakVis;  // fascia = raffica, scala = vento assoluto
    for(let seg=0;seg<SEG;seg++){
      let any=false;
      ctx.beginPath();
      for(const s of streaks){
        if(s.b!==b)continue;
        any=true;
        const t0=(seg+s.ph*0.12)/SEG, t1=t0+0.66/SEG;
        ctx.moveTo(s.x+s.dx*s.len*t0,s.y+s.dy*s.len*t0);
        ctx.lineTo(s.x+s.dx*s.len*t1,s.y+s.dy*s.len*t1);
      }
      if(!any)continue;
      ctx.strokeStyle="rgba(246,240,224,"+(base*(0.34+0.66*seg/(SEG-1))).toFixed(3)+")";
      ctx.lineWidth=(1.15+b*0.75)/z;               // il vento forte "pesa" di più
      ctx.stroke();
    }
    // punta chiara in testa: toglie l'ambiguità sul verso
    ctx.beginPath();let any2=false;
    for(const s of streaks){
      if(s.b!==b)continue;any2=true;
      ctx.moveTo(s.x+s.dx*s.len,s.y+s.dy*s.len);
      ctx.arc(s.x+s.dx*s.len,s.y+s.dy*s.len,(1.25+b*0.55)/z,0,TAU);
    }
    if(any2){ctx.fillStyle="rgba(250,246,234,"+Math.min(0.95,base*1.7).toFixed(3)+")";ctx.fill();}
  }
  ctx.lineCap="butt";
}
function islandPath(is){
  const p=is.p;
  ctx.beginPath();ctx.moveTo(p[0],p[1]);
  for(let i=2;i<p.length;i+=2) ctx.lineTo(p[i],p[i+1]);
  ctx.closePath();
}
function drawIsland(is,v,z){
  if(is.x1+is.hw*3<v.x0||is.x0-is.hw*3>v.x1||is.y1+is.hw*3<v.y0||is.y0-is.hw*3>v.y1)return;
  const w=is.hw;
  ctx.lineJoin="round";ctx.lineCap="round";
  islandPath(is);
  ctx.strokeStyle="rgba(61,146,171,.28)";ctx.lineWidth=w*4.4;ctx.stroke();   // secca esterna
  ctx.strokeStyle="rgba(61,146,171,.42)";ctx.lineWidth=w*1.9;ctx.stroke();   // bassofondo
  ctx.fillStyle=C("--land");ctx.fill();
  ctx.save();ctx.clip();
  ctx.strokeStyle=C("--sand");ctx.lineWidth=w*1.5;ctx.stroke();              // spiaggia, solo dentro
  ctx.restore();
  ctx.strokeStyle="rgba(10,36,51,.45)";ctx.lineWidth=2/z;ctx.stroke();
  if(is.n && is.l){                                                           // toponimo
    ctx.fillStyle="rgba(24,54,42,.55)";
    ctx.font=clamp(Math.min(is.x1-is.x0,is.y1-is.y0)*0.09*z,10,22)/z+"px ui-monospace,monospace";
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(is.n.toUpperCase(),is.l[0],is.l[1]);
    ctx.textBaseline="alphabetic";
  }
}
function drawMarks(z){
  world.marks.forEach((m,i)=>{
    const done=i<game.next, nxt=i===game.next;
    ctx.strokeStyle=nxt?"rgba(226,102,45,.55)":"rgba(243,234,212,.18)";
    ctx.lineWidth=2/z;
    ctx.beginPath();ctx.arc(m.x,m.y,MARK_R,0,TAU);ctx.stroke();
    if(nxt){
      const p=1+Math.sin(game.t*3)*0.12;
      ctx.strokeStyle="rgba(226,102,45,.3)";ctx.beginPath();ctx.arc(m.x,m.y,MARK_R*1.5*p,0,TAU);ctx.stroke();
    }
    ctx.fillStyle=done?"rgba(127,196,122,.85)":C("--accent");
    ctx.beginPath();ctx.arc(m.x,m.y,7,0,TAU);ctx.fill();
    ctx.fillRect(m.x-1,m.y-22,2,22);
    ctx.beginPath();ctx.moveTo(m.x+1,m.y-22);ctx.lineTo(m.x+13,m.y-17);ctx.lineTo(m.x+1,m.y-12);ctx.fill();
    ctx.fillStyle="rgba(243,234,212,.9)";ctx.font=(11/z*3).toFixed(1)+"px ui-monospace,monospace";
    ctx.textAlign="center";ctx.fillText(String(i+1),m.x,m.y+26);
  });
}
function drawGhost(){
  if(!voy||!voy.ghost)return;
  const tr=voy.ghost.track;
  ctx.strokeStyle="rgba(243,234,212,.16)";ctx.lineWidth=1.6/game.zoom;ctx.setLineDash([6/game.zoom,6/game.zoom]);
  ctx.beginPath();ctx.moveTo(tr[0][0],tr[0][1]);
  for(let i=1;i<tr.length;i++)ctx.lineTo(tr[i][0],tr[i][1]);
  ctx.stroke();ctx.setLineDash([]);
  if(!voy.moving)return;
  let a=tr[0],b=tr[tr.length-1];
  for(let i=1;i<tr.length;i++){ if(tr[i][2]>=voy.t){a=tr[i-1];b=tr[i];break;} }
  const f=(b[2]-a[2])>0?clamp((voy.t-a[2])/(b[2]-a[2]),0,1):0;
  const gx=lerp(a[0],b[0],f), gy=lerp(a[1],b[1],f);
  const ang=Math.atan2(b[0]-a[0],-(b[1]-a[1]));
  ctx.save();ctx.translate(gx,gy);ctx.rotate(ang);
  ctx.fillStyle="rgba(243,234,212,.30)";ctx.strokeStyle="rgba(243,234,212,.5)";ctx.lineWidth=0.4;
  const L=K.LOA;
  ctx.beginPath();ctx.moveTo(0,-L*0.55);ctx.lineTo(L*0.17,L*0.45);ctx.lineTo(-L*0.17,L*0.45);ctx.closePath();
  ctx.fill();ctx.stroke();ctx.restore();
}
function drawWake(){
  if(boat.wake.length<3)return;
  ctx.lineCap="round";
  for(let i=1;i<boat.wake.length;i++){
    const a=(1-i/boat.wake.length);
    ctx.strokeStyle="rgba(255,255,255,"+(a*0.16*clamp(boat.wake[i].s/3,0,1)).toFixed(3)+")";
    ctx.lineWidth=1+a*3.4;
    ctx.beginPath();ctx.moveTo(boat.wake[i-1].x,boat.wake[i-1].y);ctx.lineTo(boat.wake[i].x,boat.wake[i].y);ctx.stroke();
  }
  ctx.lineCap="butt";
}
function drawBoat(){
  const L=K.LOA, B=L*0.32;
  ctx.save();
  ctx.translate(boat.x,boat.y);ctx.rotate(boat.h);
  const hs=1-Math.abs(boat.heel)*0.28;                 // sbandamento visto dall'alto
  ctx.save();ctx.scale(hs,1);ctx.translate(boat.heel*B*0.5,0);

  // scafo
  ctx.beginPath();
  ctx.moveTo(0,-L*0.55);
  ctx.bezierCurveTo(B*0.62,-L*0.24, B*0.5,L*0.22, B*0.38,L*0.45);
  ctx.lineTo(-B*0.38,L*0.45);
  ctx.bezierCurveTo(-B*0.5,L*0.22,-B*0.62,-L*0.24,0,-L*0.55);
  ctx.closePath();
  ctx.fillStyle="#f4efe2";ctx.fill();
  ctx.strokeStyle="rgba(10,36,51,.55)";ctx.lineWidth=0.35;ctx.stroke();
  // pozzetto
  ctx.fillStyle="#c9b98f";
  ctx.beginPath();ctx.ellipse(0,L*0.22,B*0.24,L*0.16,0,0,TAU);ctx.fill();
  ctx.restore();

  // randa (albero a -0.12L)
  // ── vele: stessa costruzione per randa e fiocco  // ── vele: stessa costruzione per randa e fiocco
  // Il colore della vela dice la regolazione: ambra = fileggia, bianco-verde =
  // ottima, arancio = in stallo, azzurro = a collo (messa lì apposta).
  const SAILCOL={
    collo:   ["rgba(150,196,224,.88)","rgba(96,168,214,1)"],
    lasca:   ["rgba(240,226,190,.62)","rgba(232,177,61,.85)"],
    fileggia:["rgba(232,199,116,.42)","rgba(232,177,61,.95)"],
    stretta: ["rgba(232,199,116,.42)","rgba(232,177,61,.95)"],
    ottima:  ["rgba(238,252,236,.96)","rgba(127,196,122,1)"],
    aperta:  ["rgba(238,252,236,.96)","rgba(127,196,122,1)"],   // in poppa è giusto così
    cazzata: ["rgba(243,238,225,.92)","rgba(196,192,176,.9)"],
    stallo:  ["rgba(226,150,110,.94)","rgba(226,102,45,1)"]
  };
  const trimColor=st=>SAILCOL[st]||SAILCOL.cazzata;
  function sail(ox,oy,ang,len,side,luff,st){
    const col=trimColor(st);
    const d=dv(ang), cx=ox+d.x*len, cy=oy+d.y*len;
    const camber=(1-luff)*0.22+0.05;
    const bulge=dv(ang+side*Math.PI/2);
    const mx=(ox+cx)/2+bulge.x*len*camber, myy=(oy+cy)/2+bulge.y*len*camber;
    ctx.fillStyle=col[0];
    ctx.beginPath();ctx.moveTo(ox,oy);
    if(luff>0.5){                                    // fileggia: il bordo sbatte
      const f=Math.sin(game.t*22+len)*0.16*luff;
      ctx.quadraticCurveTo(mx+f*len,myy+f*len*0.3,cx,cy);
      ctx.quadraticCurveTo(mx-f*len,myy-f*len*0.3,ox,oy);
    }else{
      ctx.quadraticCurveTo(mx,myy,cx,cy);ctx.lineTo(ox,oy);
    }
    ctx.closePath();ctx.fill();
    ctx.strokeStyle=col[1];ctx.lineWidth=0.42;ctx.stroke();   // bordo colorato = spia
    ctx.strokeStyle="rgba(10,36,51,.75)";ctx.lineWidth=0.42;  // boma / punta di scotta
    ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(cx,cy);ctx.stroke();

    // filetti segnavento: sottovento verde, sopravvento rosso.
    // Dritti indietro = flusso attaccato. Sollevati = fileggia. Che vorticano = stallo.
    const bx0=ox+d.x*len*0.42, by0=oy+d.y*len*0.42;
    const per=dv(ang+side*Math.PI/2), tl=len*0.15;
    const jit=Math.sin(game.t*16+len*3);
    for(const lee of [1,-1]){
      let dir=ang+jit*0.05;
      if(luff>0.5 && lee<0) dir=ang+side*(1.55+jit*0.45);       // sopravvento si alza
      else if(st==="stallo" && lee>0) dir=ang-side*(1.9+jit*0.55); // sottovento vortica
      const dd=dv(dir);
      const px=bx0+per.x*0.5*lee, py=by0+per.y*0.5*lee;
      ctx.strokeStyle=lee>0?"rgba(110,224,110,.95)":"rgba(238,88,70,.95)";
      ctx.lineWidth=0.3;
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+dd.x*tl,py+dd.y*tl);ctx.stroke();
    }
  }
  const my=-L*0.12;
  if(boat.spi){                                      // spinnaker: grande, tondo, colorato
    const ang=boat.jibDraw, side=boat.boomSide, len=L*0.52;
    const d=dv(ang), cx=d.x*len, cy=-L*0.55+d.y*len;
    const bulge=dv(ang+side*Math.PI/2);
    const f=boat.spiLimp?Math.sin(game.t*14)*0.12:0;
    const c1=(-L*0.55+cy)/2+bulge.x*len*(0.42+f), c2=0;
    ctx.fillStyle=boat.spiLimp?"rgba(226,140,90,.45)":"rgba(230,126,60,.88)";
    ctx.strokeStyle="rgba(10,36,51,.5)";ctx.lineWidth=0.4;
    ctx.beginPath();ctx.moveTo(0,-L*0.55);
    ctx.quadraticCurveTo(cx/2+bulge.x*len*(0.55+f),(-L*0.55+cy)/2+bulge.y*len*(0.55+f),cx,cy);
    ctx.quadraticCurveTo(cx/2+bulge.x*len*(0.16+f),(-L*0.55+cy)/2+bulge.y*len*(0.16+f),0,-L*0.55);
    ctx.closePath();ctx.fill();ctx.stroke();
  }else if(boat.jibFurled){                          // fiocco avvolto sullo strallo
    ctx.strokeStyle="rgba(214,205,182,.95)";ctx.lineWidth=1.1;
    ctx.beginPath();ctx.moveTo(0,-L*0.55);ctx.lineTo(0,-L*0.40);ctx.stroke();
  }else{
    sail(0,-L*0.55,boat.jibDraw,L*0.40,boat.jibSide,boat.luffJ,boat.stJ);
  }
  sail(0,my,boat.boomDraw,L*0.44*(0.72+0.28*K.REEF[boat.reef]),boat.boomSide,boat.luff,boat.stM);
  ctx.fillStyle="#3a3a33";ctx.beginPath();ctx.arc(0,my,0.55,0,TAU);ctx.fill();
  // timone: barra a dritta -> la pala devia a dritta, la poppa va a sinistra,
  // la prua accosta a dritta. Prima era disegnata al contrario.
  const rd=dv(Math.PI-boat.rudder*0.55);
  ctx.strokeStyle="rgba(10,36,51,.7)";ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(0,L*0.45);ctx.lineTo(rd.x*L*0.16,L*0.45+rd.y*L*0.16);ctx.stroke();
  ctx.restore();
}

/* ══════════════════ strumenti ══════════════════ */
function pointOfSail(twa){
  const a=Math.abs(twa*R2D);
  if(a<32)return"NEL VENTO";
  if(a<52)return"BOLINA STRETTA";
  if(a<72)return"BOLINA LARGA";
  if(a<105)return"TRAVERSO";
  if(a<140)return"LASCO";
  if(a<168)return"GRAN LASCO";
  return"POPPA";
}
function panel(x,y,w,h){
  ctx.fillStyle="rgba(8,32,46,.80)";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="rgba(243,234,212,.22)";ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
function label(t,x,y){ctx.fillStyle=C("--chart-dim");ctx.font="10px ui-monospace,monospace";
  ctx.textAlign="left";ctx.fillText(t,x,y);}
function value(t,x,y,col,size){ctx.fillStyle=col||C("--chart");
  ctx.font=(size||16)+"px ui-monospace,monospace";ctx.textAlign="left";ctx.fillText(t,x,y);}

function drawHUD(){
  const w=windAt(boat.x,boat.y);
  const sp=Math.hypot(boat.vx,boat.vy), kn=sp*1.94384;
  const twa=norm(norm(w.from)-boat.h);
  const hdg=(norm(boat.h)*R2D+360)%360;

  /* ── strumenti, in alto a sinistra */
  const px=14,py=14,pw=196,ph=126;
  panel(px,py,pw,ph);
  label("VELOCITÀ",px+12,py+20);
  value(kn.toFixed(1),px+12,py+46,C("--chart"),26);
  label("kn",px+12+ctx.measureText(kn.toFixed(1)).width+6,py+46);
  label("ROTTA",px+112,py+20);
  value(String(Math.round(hdg)).padStart(3,"0")+"°",px+112,py+44,C("--chart"),18);
  ctx.fillStyle="rgba(243,234,212,.15)";ctx.fillRect(px+12,py+58,pw-24,1);
  label("VENTO REALE",px+12,py+76);
  if(w.spd>windBase*1.10||w.spd<windBase*0.72){
    const om=w.spd<windBase*0.72;
    ctx.fillStyle=om?C("--warn"):C("--accent");ctx.font="10px ui-monospace,monospace";
    ctx.textAlign="right";ctx.fillText(om?"IN OMBRA":"RAFFICA",px+pw-12,py+76);ctx.textAlign="left";}
  value(String(Math.round((w.from*R2D+360)%360)).padStart(3,"0")+"°  "+(w.spd*1.94384).toFixed(0)+" kn",px+12,py+94,C("--chart"),13);
  label("ANDATURA",px+12,py+112);
  ctx.fillStyle=Math.abs(twa*R2D)<32?C("--warn"):C("--good");
  ctx.font="12px ui-monospace,monospace";ctx.textAlign="right";
  ctx.fillText(pointOfSail(twa),px+pw-12,py+112);

  /* ── rosa dei venti, in alto a destra */
  const cxr=VW-102, cyr=102, R=76;
  ctx.save();ctx.translate(cxr,cyr);
  ctx.fillStyle="rgba(8,32,46,.80)";ctx.beginPath();ctx.arc(0,0,R+14,0,TAU);ctx.fill();
  ctx.strokeStyle="rgba(243,234,212,.22)";ctx.lineWidth=1;ctx.stroke();
  // corona graduata orientata a prua
  ctx.save();ctx.rotate(-boat.h);
  for(let a=0;a<360;a+=10){
    const p=dv(a*D2R), big=a%90===0;
    ctx.strokeStyle=big?"rgba(243,234,212,.75)":"rgba(243,234,212,.3)";
    ctx.lineWidth=big?1.6:1;
    ctx.beginPath();ctx.moveTo(p.x*R,p.y*R);ctx.lineTo(p.x*(R-(big?11:6)),p.y*(R-(big?11:6)));ctx.stroke();
  }
  ctx.fillStyle="rgba(243,234,212,.8)";ctx.font="10px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
  ["N","E","S","W"].forEach((s,i)=>{const p=dv(i*90*D2R);ctx.fillText(s,p.x*(R-22),p.y*(R-22));});
  // freccia vento reale (da dove viene)
  const wp=dv(w.from);
  ctx.strokeStyle=C("--accent");ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(wp.x*(R-2),wp.y*(R-2));ctx.lineTo(wp.x*22,wp.y*22);ctx.stroke();
  ctx.fillStyle=C("--accent");
  const wn=dv(w.from+Math.PI/2);
  ctx.beginPath();ctx.moveTo(wp.x*20,wp.y*20);
  ctx.lineTo(wp.x*34+wn.x*7,wp.y*34+wn.y*7);ctx.lineTo(wp.x*34-wn.x*7,wp.y*34-wn.y*7);ctx.closePath();ctx.fill();
  // settore proibito
  ctx.fillStyle="rgba(232,177,61,.12)";
  ctx.beginPath();ctx.moveTo(0,0);
  ctx.arc(0,0,R,w.from-Math.PI/2-35*D2R,w.from-Math.PI/2+35*D2R);ctx.closePath();ctx.fill();
  ctx.restore();
  // vento apparente (relativo alla prua, quindi fuori dalla rotazione)
  const ap=dv(norm(boat.beta));
  ctx.strokeStyle="rgba(243,234,212,.55)";ctx.lineWidth=1.4;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(ap.x*(R-6),ap.y*(R-6));ctx.lineTo(0,0);ctx.stroke();ctx.setLineDash([]);
  // barchetta al centro con la vela
  ctx.fillStyle="rgba(243,234,212,.9)";
  ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(6,10);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();
  const bp=dv(boat.boomDraw), jp=dv(boat.jibDraw);
  ctx.lineWidth=2.5;
  ctx.strokeStyle=boat.luff>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(bp.x*17,-4+bp.y*17);ctx.stroke();
  ctx.lineWidth=1.8;
  ctx.strokeStyle=boat.luffJ>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(jp.x*13,-18+jp.y*13);ctx.stroke();
  ctx.textBaseline="alphabetic";
  ctx.restore();
  ctx.fillStyle=C("--chart-dim");ctx.font="9px ui-monospace,monospace";ctx.textAlign="center";
  ctx.fillText("VENTO APP "+Math.round(Math.abs(boat.beta*R2D))+"°"+(boat.beta>0?" DRITTA":" SIN"),cxr,cyr+R+30);

  /* ── regolazione / timone / sbandamento, in basso a sinistra */
  const bw=306, bh=178, bx=14, by=VH-bh-14;
  panel(bx,by,bw,bh);
  const gw=bw-24, gx=bx+12;
  function sailGauge(name,y,trimRad,W,st,extra){
    label(name,gx,y);
    const TXT={
      collo:   ["A COLLO — LA PRUA CADE","#6ea8d6"],
      avvolto: ["AVVOLTO (F)",C("--chart-dim")],
      sventato:["SVENTATO — POGGIA O AMMAINA",C("--warn")],
      fileggia:["FILEGGIA — CAZZA",C("--warn")],
      stretta: ["PRUA TROPPO AL VENTO — POGGIA",C("--warn")],
      ottima:  ["OTTIMA",C("--good")],
      aperta:  ["TUTTA APERTA — SPINTA MASSIMA",C("--good")],
      cazzata: ["UN PO' CAZZATA — LASCA",C("--chart")],
      lasca:   ["TROPPO LASCATA — CAZZA",C("--warn")],
      stallo:  ["IN STALLO — LASCA",C("--accent")]
    };
    const t=TXT[st]||TXT.cazzata;
    ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";
    ctx.fillStyle=t[1];ctx.fillText((extra||"")+t[0],gx+gw,y);ctx.textAlign="left";

    const gy=y+7;
    if(st==="avvolto"||st==="collo"||st==="sventato"){
      ctx.fillStyle="rgba(243,234,212,.07)";ctx.fillRect(gx,gy,gw,11);
      if(st==="collo"){ctx.fillStyle="rgba(110,168,214,.30)";ctx.fillRect(gx,gy,gw,11);}
      return;
    }
    // La barra è la POSIZIONE DELLA SCOTTA, da tutta cazzata (sx) a tutta lascata (dx).
    // La fascia verde è dove dovrebbe stare adesso: basta portarci sopra il segno.
    const lo=W.lo*R2D, hi=W.hi*R2D, maxTdeg=W.maxT*R2D;
    const X=v=>gx+gw*clamp(v,0,maxTdeg)/maxTdeg;
    ctx.fillStyle="rgba(226,102,45,.26)";ctx.fillRect(gx,gy,X(lo)-gx,11);          // troppo cazzata
    ctx.fillStyle="rgba(127,196,122,.40)";ctx.fillRect(X(lo),gy,X(hi)-X(lo),11);   // finestra buona
    ctx.fillStyle="rgba(232,177,61,.28)";ctx.fillRect(X(hi),gy,gx+gw-X(hi),11);    // troppo lascata
    ctx.fillStyle="rgba(127,196,122,.9)";ctx.fillRect(X(W.opt*R2D)-0.5,gy,1,11);   // ottimo
    ctx.fillStyle=C("--chart");ctx.fillRect(X(trimRad*R2D)-1.5,gy-3,3,17);
    ctx.font="9px ui-monospace,monospace";ctx.fillStyle="rgba(243,234,212,.35)";
    ctx.fillText("CAZZATA",gx+2,gy+9.5);
    ctx.textAlign="right";ctx.fillText("LASCATA",gx+gw-2,gy+9.5);ctx.textAlign="left";
  }
  sailGauge(boat.reef?"RANDA · "+boat.reef+"ª MANO":"RANDA",by+18,boat.trim,boat.wM,boat.stM);
  sailGauge(boat.spi?"SPINNAKER":"FIOCCO",by+52,boat.jib,boat.wJ,boat.stJ,boat.butterfly?"A FARFALLA · ":"");

  // bilanciamento: da che parte tira la barca quando molli la barra
  label("BILANCIAMENTO",gx,by+88);
  const bal=boat.balance, sens=Math.abs(boat.yawSail||0)>0.5;   // °/s: sotto è ininfluente
  let btxt,bcol;
  if(!sens){btxt="NEUTRO — TIENE LA ROTTA";bcol=C("--good");}
  else if(bal>0.30){btxt="ORZA — CAZZA IL FIOCCO";bcol=C("--warn");}
  else if(bal<-0.30){btxt="PUGGIA — CAZZA LA RANDA";bcol=C("--warn");}
  else{btxt="NEUTRO — TIENE LA ROTTA";bcol=C("--good");}
  ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=bcol;
  ctx.fillText(btxt,gx+gw,by+88);ctx.textAlign="left";
  const by2=by+95;
  ctx.fillStyle="rgba(243,234,212,.10)";ctx.fillRect(gx,by2,gw,9);
  ctx.fillStyle="rgba(127,196,122,.30)";ctx.fillRect(gx+gw*0.35,by2,gw*0.30,9);
  ctx.fillStyle=C("--chart");ctx.fillRect(gx+gw/2+bal*gw/2-1.5,by2-3,3,15);
  ctx.font="9px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
  ctx.fillText("FIOCCO",gx,by2+22);ctx.textAlign="right";ctx.fillText("RANDA",gx+gw,by2+22);ctx.textAlign="left";

  // barra: comando (fantasma) e pala reale
  label("TIMONE",gx,by+140);
  const rx=gx+58, rw2=104;
  ctx.strokeStyle="rgba(243,234,212,.25)";ctx.beginPath();
  ctx.moveTo(rx,by+136);ctx.lineTo(rx+rw2,by+136);ctx.stroke();
  ctx.fillStyle="rgba(243,234,212,.25)";ctx.fillRect(rx+rw2/2-.5,by+132,1,8);
  ctx.fillStyle="rgba(243,234,212,.35)";ctx.fillRect(rx+rw2/2+boat.rudderCmd*rw2/2-1,by+129,2,14);
  ctx.fillStyle=C("--chart");ctx.fillRect(rx+rw2/2+boat.rudder*rw2/2-1.5,by+131,3,10);
  label("SBAND.",gx+186,by+140);
  ctx.fillStyle=Math.abs(boat.heel)>0.7?C("--accent"):C("--chart");
  ctx.font="13px ui-monospace,monospace";ctx.textAlign="right";
  ctx.fillText(Math.round(Math.abs(boat.heel)*32)+"°",gx+gw,by+141);ctx.textAlign="left";

  label(game.pilot===1?"BARRA":"AUTOTIMONIERE",gx,by+164);
  ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";
  if(game.pilot===1){ctx.fillStyle=C("--chart");
    ctx.fillText("RICHIAMO AL CENTRO",gx+gw,by+164);}
  else if(game.pilot===2){ctx.fillStyle=C("--good");
    ctx.fillText("ROTTA "+String(Math.round((game.pilotTgt*R2D+360)%360)).padStart(3,"0")+"°",gx+gw,by+164);}
  else if(game.pilot===3){ctx.fillStyle=C("--good");
    ctx.fillText("VENTO "+Math.round(Math.abs(game.pilotTgt*R2D))+"° "+(game.pilotTgt>0?"DRITTA":"SIN"),gx+gw,by+164);}
  else{ctx.fillStyle=C("--chart-dim");ctx.fillText("SPENTO  ·  Z PER INSERIRE",gx+gw,by+164);}
  ctx.textAlign="left";
  /* ── carta ridotta, in basso a destra */
  const ms=168, mx=VW-ms-14, my2=VH-ms-14;
  panel(mx,my2,ms,ms);
  const k=ms/(world.size*1.06), c=world.size*0.53-0;
  ctx.save();ctx.beginPath();ctx.rect(mx,my2,ms,ms);ctx.clip();
  ctx.translate(mx,my2);ctx.scale(k,k);ctx.translate(c,c);
  ctx.fillStyle="rgba(61,146,171,.30)";
  for(const is of world.islands){islandPath(is);ctx.fill();}
  const mr=world.size/120;
  world.marks.forEach((m,i)=>{
    ctx.fillStyle=i<game.next?C("--good"):(i===game.next?C("--accent"):"rgba(243,234,212,.35)");
    ctx.beginPath();ctx.arc(m.x,m.y,mr,0,TAU);ctx.fill();
  });
  ctx.fillStyle=C("--chart");
  ctx.save();ctx.translate(boat.x,boat.y);ctx.rotate(boat.h);
  const bs=world.size/40;
  ctx.beginPath();ctx.moveTo(0,-bs);ctx.lineTo(bs*0.6,bs*0.73);ctx.lineTo(-bs*0.6,bs*0.73);ctx.closePath();ctx.fill();
  ctx.restore();ctx.restore();

  /* ── regata, in alto a destra sotto la rosa */
  const ry=14, tw=176;
  const tp=VW-14-176-232 > 240 ? VW-14-176-232 : px;   // sotto gli strumenti se non c'è spazio
  const ryy=tp===px ? py+ph+10 : ry;
  panel(tp,ryy,tw,64);
  label("REGATA",tp+12,ryy+18);
  ctx.textAlign="left";
  value(game.done?fmtT(game.done):fmtT(game.clock),tp+12,ryy+44,game.done?C("--good"):C("--chart"),20);
  ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");ctx.textAlign="right";
  ctx.fillText(game.done?"COMPLETATA":"BOA "+(game.next+1)+"/"+world.marks.length,tp+tw-12,ryy+44);
  if(!game.done && world.marks[game.next]){
    const m=world.marks[game.next];
    const d=Math.hypot(m.x-boat.x,m.y-boat.y);
    const br=(angOf(m.x-boat.x,m.y-boat.y)*R2D+360)%360;
    ctx.textAlign="left";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
    ctx.fillText("RILEV "+String(Math.round(br)).padStart(3,"0")+"°   "+(d<1000?Math.round(d)+" m":(d/1000).toFixed(2)+" km"),tp+12,ryy+58);
    // freccia sul bordo se la boa è fuori campo
    const sx=VW/2+(m.x-cam.x)*game.zoom, sy=VH/2+(m.y-cam.y)*game.zoom;
    if(sx<40||sx>VW-40||sy<40||sy>VH-40){
      const a=Math.atan2(sy-VH/2,sx-VW/2);
      const ex=VW/2+Math.cos(a)*Math.min(VW/2-46,VH/2-46), ey=VH/2+Math.sin(a)*Math.min(VW/2-46,VH/2-46);
      ctx.save();ctx.translate(ex,ey);ctx.rotate(a);
      ctx.fillStyle=C("--accent");ctx.globalAlpha=.85;
      ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,8);ctx.lineTo(-8,-8);ctx.closePath();ctx.fill();
      ctx.restore();
    }
  }

  /* ── traversata in corso */
  if(voy&&voy.moving){
    const tw2=176, tx=14, ty=py+ph+10;
    panel(tx,ty,tw2,voy.ghost?62:46);
    label("TRAVERSATA",tx+12,ty+16);
    ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
    ctx.fillText(fmtT(voy.t).split(".")[0],tx+tw2-12,ty+16);ctx.textAlign="left";
    ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--chart");
    ctx.fillText(voy.from,tx+12,ty+34);
    ctx.textAlign="right";ctx.fillStyle=C("--chart-dim");
    ctx.fillText(nm(voy.dist).toFixed(2)+" nm",tx+tw2-12,ty+34);ctx.textAlign="left";
    if(voy.ghost){
      ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
      ctx.fillText("→ "+voy.ghost.to,tx+12,ty+52);
      if(voy.delta!==null){
        const d=voy.delta;
        ctx.fillStyle=d<0?C("--good"):C("--accent");ctx.textAlign="right";
        ctx.fillText((d<0?"−":"+")+Math.abs(d).toFixed(0)+" s",tx+tw2-12,ty+52);ctx.textAlign="left";
      }else{
        ctx.fillStyle="rgba(243,234,212,.3)";ctx.textAlign="right";
        ctx.fillText("fuori rotta",tx+tw2-12,ty+52);ctx.textAlign="left";
      }
    }
  }

  /* ── in panne: istruzioni che restano finché servono */
  if((boat.stuck>2.5||boat.gtime>2.5) && !game.paused){
    const ag=boat.gtime>2.5;
    const pw2=330, px2=VW/2-pw2/2, py2=VH*0.60;
    panel(px2,py2,pw2,96);
    ctx.textAlign="left";ctx.font="11px ui-monospace,monospace";
    ctx.fillStyle=C("--accent");
    ctx.fillText(ag?"INCAGLIATO — COME LIBERARSI":"IN PANNE — COME RIPARTIRE",px2+14,py2+22);
    ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--chart");
    const steps=ag?[
      "1.  Lasca tutto: le vele ti spingono a riva   (\u2193)",
      "2.  Fiocco a collo   (B): la prua gira al largo",
      "3.  Poi cazza e scappa via di bolina"
    ]:[
      "1.  Lasca la randa tutta   (\u2193)",
      "2.  Fiocco a collo   (B)",
      "3.  Barra tutta da un lato e aspetta"
    ];
    steps.forEach((t,i)=>{
      const done=(i===1&&boat.jibBack);
      ctx.fillStyle=done?C("--good"):C("--chart");
      ctx.fillText(done?t.replace(/^\d\./,"\u2713 "):t,px2+14,py2+44+i*17);
    });
  }

  /* ── messaggi */
  if(game.msgT>0){
    ctx.globalAlpha=clamp(game.msgT,0,1);
    ctx.textAlign="center";ctx.font="13px ui-monospace,monospace";
    const tw2=ctx.measureText(game.msg).width+28;
    ctx.fillStyle="rgba(8,32,46,.88)";ctx.fillRect(VW/2-tw2/2,VH-64,tw2,30);
    ctx.strokeStyle="rgba(226,102,45,.5)";ctx.strokeRect(VW/2-tw2/2+.5,VH-63.5,tw2-1,29);
    ctx.fillStyle=C("--chart");ctx.fillText(game.msg,VW/2,VH-44);
    ctx.globalAlpha=1;
  }
  if(game.paused){
    ctx.fillStyle="rgba(6,24,35,.55)";ctx.fillRect(0,0,VW,VH);
    ctx.fillStyle=C("--chart");ctx.font="16px ui-monospace,monospace";ctx.textAlign="center";
    ctx.fillText("IN PANNA — premi P per riprendere",VW/2,VH/2);
  }
}

/* ══════════════════ interfaccia ══════════════════ */
/* Porto di partenza: la carta ne offre una ventina, tutti ancoraggi veri. */
const portEl=document.getElementById("port");
function fillPorts(){
  const ps=world.ports||[];
  portEl.innerHTML="";
  ps.forEach((o,i)=>{
    const op=document.createElement("option");
    op.value=i;op.textContent=o.n;
    if(Math.abs(o.x-world.start.x)<2&&Math.abs(o.y-world.start.y)<2)op.selected=true;
    portEl.appendChild(op);
  });
}
function startFrom(i){
  const o=(world.ports||[])[i]; if(!o)return;
  world.start={x:o.x,y:o.y};
  resetBoat();
  say("Partenza da "+o.n);
}
portEl.onchange=e=>{
  const i=parseInt(e.target.value,10);e.target.blur();
  if(game.started&&!game.done)
    askConfirm("Ripartire da "+world.ports[i].n+"? La regata in corso e il cronometro ripartono da zero.",()=>startFrom(i));
  else startFrom(i);
};

const askEl=document.getElementById("ask");
let askCb=null;
function askConfirm(msg,cb){
  document.getElementById("asktxt").textContent=msg;
  askCb=cb;askEl.classList.add("on");
  for(const k in keys)keys[k]=0;                  // niente tasti rimasti premuti
}
function askClose(yes){
  askEl.classList.remove("on");
  const c=askCb;askCb=null;
  if(yes&&c)c();
}
document.getElementById("askyes").onclick=e=>{e.currentTarget.blur();askClose(true);};
document.getElementById("askno").onclick=e=>{e.currentTarget.blur();askClose(false);};
askEl.addEventListener("pointerdown",e=>{if(e.target===askEl)askClose(false);});

const helpEl=document.getElementById("help");
let firstClose=true;
function toggleHelp(){
  helpEl.classList.toggle("on");
  if(!helpEl.classList.contains("on")&&firstClose){firstClose=false;tutStart();}
}
document.getElementById("helpb").onclick=toggleHelp;
document.getElementById("logb").onclick=e=>{e.currentTarget.blur();toggleLog();};
document.getElementById("logclose").onclick=e=>{e.currentTarget.blur();toggleLog();};
document.getElementById("logclear").onclick=e=>{e.currentTarget.blur();
  askConfirm("Cancellare tutto il giornale di bordo? Traversate, record e polare personale andranno persi.",
    ()=>{LOG={passages:[],polar:{},best:{}};saveLog();logRender();});};
const setEl=document.getElementById("settings"), showEl=document.getElementById("showm");
function toggleMenu(){
  const hid=setEl.classList.toggle("hidden");
  showEl.classList.toggle("on",hid);
  document.getElementById("tut").style.top=hid?"46px":"58px";
}
document.getElementById("hidem").onclick=e=>{e.currentTarget.blur();toggleMenu();};
showEl.onclick=toggleMenu;
document.getElementById("closehelp").onclick=toggleHelp;
helpEl.addEventListener("pointerdown",e=>{if(e.target===helpEl)toggleHelp();});
addEventListener("keydown",e=>{if(e.key==="Escape"&&helpEl.classList.contains("on"))toggleHelp();});
document.getElementById("reset").onclick=e=>{e.currentTarget.blur();
  askConfirm("Riportare la barca al via? La regata in corso e il cronometro ripartono da zero.",resetBoat);};
document.getElementById("mapsel").onchange=e=>{mapMode=e.target.value;e.target.blur();
  newWorld(document.getElementById("seed").value||"vela");say(world.name);};
document.getElementById("gen").onclick=()=>{
  if(mapMode==="ionio"){mapMode="rnd";document.getElementById("mapsel").value="rnd";}
  newWorld(document.getElementById("seed").value||"vela");say(world.name);};
document.getElementById("tscale").onchange=e=>{timeScale=parseFloat(e.target.value);e.target.blur();
  say("Ritmo di gioco "+e.target.value.replace(".",",")+"×");};
document.getElementById("vis").oninput=e=>{streakVis=parseFloat(e.target.value);};
document.getElementById("winv").onchange=e=>{wheelInv=e.target.checked;e.target.blur();};
document.getElementById("easy").onchange=e=>{
  assist=e.target.checked?0.55:1;
  say(e.target.checked?"Mare facile — raffiche e squilibri attenuati":"Mare vero — raffiche piene");
};
document.getElementById("wind").oninput=e=>{
  windBase=parseFloat(e.target.value);
  document.getElementById("windv").textContent=windBase.toFixed(1)+" m/s";
};

/* ══════════════════ carta nautica ══════════════════ */
/* Vista a tutto schermo con l'aspetto di una carta di navigazione: carta
   chiara, terre color sabbia, secche azzurre, reticolato in gradi veri.  */
const chart={x:0,y:0,z:1,on:false,drag:null,mx:0,my:0,has:false};
const CHART={paper:"#e6eef0",deep:"#eef5f6",shoal:"#b9d9e4",land:"#e8d7ae",
             ink:"#27505f",grid:"rgba(39,80,95,.16)",dim:"rgba(39,80,95,.55)"};
function chartFit(){
  chart.z=Math.min(VW,VH)*0.86/world.size;
  chart.x=0;chart.y=0;
}
function toggleChart(){
  chart.on=!chart.on;
  if(chart.on&&!chart.has){chartFit();chart.has=true;}
}
const c2w=(sx,sy)=>({x:(sx-VW/2)/chart.z+chart.x, y:(sy-VH/2)/chart.z+chart.y});
function dms(v,ns){
  const d0=Math.floor(Math.abs(v)), m0=(Math.abs(v)-d0)*60;
  return d0+"°"+(m0<10?"0":"")+m0.toFixed(1)+"′"+ns;
}
function drawChart(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=CHART.deep;ctx.fillRect(0,0,VW,VH);
  const g=world.geo;
  ctx.save();
  ctx.translate(VW/2,VH/2);ctx.scale(chart.z,chart.z);ctx.translate(-chart.x,-chart.y);
  const hw=VW/2/chart.z, hh=VH/2/chart.z;
  const v={x0:chart.x-hw,x1:chart.x+hw,y0:chart.y-hh,y1:chart.y+hh};

  // reticolato: in gradi veri se la carta è georeferenziata, altrimenti metrico
  ctx.lineWidth=1/chart.z;ctx.strokeStyle=CHART.grid;
  const labels=[];
  if(g){
    const steps=[1,0.5,0.25,0.1,0.05,0.02,0.01,0.005];
    const stLon=steps.find(t=>(v.x1-v.x0)/(t*g.gx)<9)||0.005;
    const stLat=steps.find(t=>(v.y1-v.y0)/(t*g.gy)<9)||0.005;
    const lo0=g.lon0+v.x0/g.gx, lo1=g.lon0+v.x1/g.gx;
    for(let L=Math.ceil(lo0/stLon)*stLon;L<=lo1;L+=stLon){
      const x=(L-g.lon0)*g.gx;
      ctx.beginPath();ctx.moveTo(x,v.y0);ctx.lineTo(x,v.y1);ctx.stroke();
      labels.push([VW/2+(x-chart.x)*chart.z,null,dms(L,"E")]);
    }
    const la1=g.lat0-v.y0/g.gy, la0=g.lat0-v.y1/g.gy;
    for(let L=Math.ceil(la0/stLat)*stLat;L<=la1;L+=stLat){
      const y=(g.lat0-L)*g.gy;
      ctx.beginPath();ctx.moveTo(v.x0,y);ctx.lineTo(v.x1,y);ctx.stroke();
      labels.push([null,VH/2+(y-chart.y)*chart.z,dms(L,"N")]);
    }
  }else{
    const st=1000;
    for(let x=Math.ceil(v.x0/st)*st;x<=v.x1;x+=st){ctx.beginPath();ctx.moveTo(x,v.y0);ctx.lineTo(x,v.y1);ctx.stroke();}
    for(let y=Math.ceil(v.y0/st)*st;y<=v.y1;y+=st){ctx.beginPath();ctx.moveTo(v.x0,y);ctx.lineTo(v.x1,y);ctx.stroke();}
  }

  // terre, con la fascia di secche
  ctx.lineJoin="round";ctx.lineCap="round";
  for(const is of world.islands){
    if(is.x1<v.x0||is.x0>v.x1||is.y1<v.y0||is.y0>v.y1)continue;
    islandPath(is);
    ctx.strokeStyle=CHART.shoal;ctx.lineWidth=is.hw*2.6;ctx.stroke();
    ctx.fillStyle=CHART.land;ctx.fill();
    ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.4/chart.z;ctx.stroke();
  }
  // scia della traversata e fantasma
  if(voy&&voy.ghost){
    ctx.strokeStyle="rgba(39,80,95,.28)";ctx.lineWidth=1.4/chart.z;
    ctx.setLineDash([7/chart.z,5/chart.z]);ctx.beginPath();
    voy.ghost.track.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));
    ctx.stroke();ctx.setLineDash([]);
  }
  if(voy&&voy.track.length>1){
    ctx.strokeStyle="#c0562a";ctx.lineWidth=1.8/chart.z;ctx.beginPath();
    voy.track.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));
    ctx.stroke();
  }
  ctx.restore();

  // ─ simboli in pixel, così restano leggibili a ogni zoom
  const S=(wx,wy)=>({x:VW/2+(wx-chart.x)*chart.z, y:VH/2+(wy-chart.y)*chart.z});
  ctx.font="10px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
  for(const o of (world.ports||[])){
    const q=S(o.x,o.y);
    if(q.x<-40||q.x>VW+40||q.y<-40||q.y>VH+40)continue;
    ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(q.x,q.y,4,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.arc(q.x,q.y,1.4,0,TAU);ctx.fillStyle=CHART.ink;ctx.fill();
    ctx.fillStyle=CHART.dim;ctx.textAlign="left";
    ctx.fillText(o.n,q.x+8,q.y);
  }
  world.marks.forEach((m,i)=>{
    const q=S(m.x,m.y);
    const done=i<game.next, nxt=i===game.next;
    ctx.fillStyle=done?"#5c8f57":(nxt?"#d2611f":"rgba(39,80,95,.35)");
    ctx.beginPath();ctx.moveTo(q.x,q.y-7);ctx.lineTo(q.x+5,q.y+4);ctx.lineTo(q.x-5,q.y+4);ctx.closePath();ctx.fill();
    ctx.fillStyle=CHART.dim;ctx.textAlign="center";
    ctx.fillText(String(i+1),q.x,q.y+14);
  });
  // barca, con la rotta proiettata a dieci minuti
  const b=S(boat.x,boat.y);
  const sp=Math.hypot(boat.vx,boat.vy);
  if(sp>0.3){
    const d=dv(boat.h);
    const q2=S(boat.x+d.x*sp*600,boat.y+d.y*sp*600);
    ctx.strokeStyle="rgba(192,86,42,.55)";ctx.lineWidth=1.2;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(q2.x,q2.y);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(boat.h);
  ctx.fillStyle="#c0562a";ctx.strokeStyle="#7d3315";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();
  ctx.fill();ctx.stroke();ctx.restore();

  // etichette del reticolato sui bordi
  ctx.font="9px ui-monospace,monospace";ctx.fillStyle=CHART.dim;
  for(const L of labels){
    if(L[0]!==null&&L[0]>40&&L[0]<VW-40){ctx.textAlign="center";ctx.fillText(L[2],L[0],14);}
    if(L[1]!==null&&L[1]>20&&L[1]<VH-20){ctx.textAlign="left";ctx.fillText(L[2],6,L[1]);}
  }

  // rosa dei venti con la direzione del vento reale
  const w=windAt(boat.x,boat.y);
  const rx=VW-78, ry=78;
  ctx.strokeStyle=CHART.dim;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(rx,ry,34,0,TAU);ctx.stroke();
  ctx.beginPath();ctx.arc(rx,ry,26,0,TAU);ctx.stroke();
  for(let a=0;a<360;a+=30){const d=dv(a*D2R);
    ctx.beginPath();ctx.moveTo(rx+d.x*26,ry+d.y*26);ctx.lineTo(rx+d.x*34,ry+d.y*34);ctx.stroke();}
  ctx.fillStyle=CHART.ink;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="10px ui-monospace,monospace";ctx.fillText("N",rx,ry-42);
  const wp=dv(w.from);
  ctx.strokeStyle="#c0562a";ctx.lineWidth=2.4;
  ctx.beginPath();ctx.moveTo(rx+wp.x*24,ry+wp.y*24);ctx.lineTo(rx-wp.x*20,ry-wp.y*20);ctx.stroke();
  const wn=dv(w.from+Math.PI/2);
  ctx.fillStyle="#c0562a";ctx.beginPath();
  ctx.moveTo(rx-wp.x*20,ry-wp.y*20);
  ctx.lineTo(rx-wp.x*10+wn.x*6,ry-wp.y*10+wn.y*6);
  ctx.lineTo(rx-wp.x*10-wn.x*6,ry-wp.y*10-wn.y*6);ctx.closePath();ctx.fill();
  ctx.fillStyle=CHART.dim;ctx.font="9px ui-monospace,monospace";
  ctx.fillText("VENTO "+String(Math.round((w.from*R2D+360)%360)).padStart(3,"0")+"° "+
               (w.spd*1.94384).toFixed(0)+" kn",rx,ry+48);

  // scala grafica, in miglia vere
  const targetPx=170;
  const nmPer=1852/SCALE_GEO;                    // metri di gioco per miglio reale
  let step=[0.25,0.5,1,2,5,10,20].find(t=>t*nmPer*chart.z>targetPx*0.55)||20;
  const pxs=step*nmPer*chart.z;
  const bx=24, by=VH-38;
  ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+pxs,by);ctx.stroke();
  for(let i=0;i<=4;i++){const x=bx+pxs*i/4;
    ctx.beginPath();ctx.moveTo(x,by-4);ctx.lineTo(x,by+4);ctx.stroke();}
  ctx.fillStyle=CHART.ink;ctx.textAlign="left";ctx.font="10px ui-monospace,monospace";
  ctx.fillText("0",bx-2,by+14);ctx.fillText(step+" miglia nautiche",bx+pxs+8,by);

  // lettura del cursore: rilevamento e distanza dalla barca
  if(chart.mx>0){
    const p=c2w(chart.mx,chart.my);
    const dx=p.x-boat.x, dy=p.y-boat.y;
    const dist=Math.hypot(dx,dy), brg=(angOf(dx,dy)*R2D+360)%360;
    ctx.strokeStyle="rgba(192,86,42,.45)";ctx.lineWidth=1;ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(chart.mx,chart.my);ctx.stroke();ctx.setLineDash([]);
    const txt="RIL "+String(Math.round(brg)).padStart(3,"0")+"°   "+nm(dist).toFixed(2)+" nm";
    ctx.font="11px ui-monospace,monospace";
    const tw3=ctx.measureText(txt).width+16;
    ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(chart.mx+12,chart.my-11,tw3,22);
    ctx.strokeStyle=CHART.dim;ctx.lineWidth=1;ctx.strokeRect(chart.mx+12.5,chart.my-10.5,tw3-1,21);
    ctx.fillStyle=CHART.ink;ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillText(txt,chart.mx+20,chart.my);
    if(g){
      const la=g.lat0-p.y/g.gy, lo=g.lon0+p.x/g.gx;
      ctx.font="9px ui-monospace,monospace";ctx.fillStyle=CHART.dim;
      ctx.fillText(dms(la,"N")+"  "+dms(lo,"E"),chart.mx+20,chart.my+18);
    }
  }

  // intestazione
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle=CHART.ink;ctx.font="12px ui-monospace,monospace";
  ctx.fillText(world.name.toUpperCase(),24,32);
  ctx.fillStyle=CHART.dim;ctx.font="9px ui-monospace,monospace";
  ctx.fillText("SCALA DI GIOCO 1:"+SCALE_GEO+"  ·  TRASCINA PER SPOSTARE  ·  ROTELLA PER INGRANDIRE  ·  C CHIUDE  ·  0 INQUADRA TUTTO",24,46);
  ctx.textBaseline="alphabetic";
}

/* ══════════════════ giornale di bordo ══════════════════ */
/* Salvataggio a strati: usa l'archivio degli artefatti se c'è, altrimenti
   quello del browser, altrimenti tiene tutto in memoria per la sessione. */
const memStore={};
let storeKind="memoria";
const store={
  async get(k){
    try{ if(window.storage&&window.storage.get){const r=await window.storage.get(k);
      storeKind="archivio";if(r&&r.value)return JSON.parse(r.value);return null;} }catch(e){storeKind="archivio";return null;}
    try{ const v=localStorage.getItem(k); storeKind="browser"; return v?JSON.parse(v):null; }catch(e){}
    return memStore[k]!==undefined?memStore[k]:null;
  },
  async set(k,v){
    memStore[k]=v;
    const t=JSON.stringify(v);
    try{ if(window.storage&&window.storage.set){await window.storage.set(k,t);return;} }catch(e){}
    try{ localStorage.setItem(k,t); }catch(e){}
  }
};

const SCALE_GEO=6;                                   // la carta è ridotta 1:6
const nm=m=>m*SCALE_GEO/1852;                        // miglia nautiche vere
const avgKn=(m,t)=>m/t*1.94384;                      // velocità media effettiva della barca
const realT=t=>{                                     // tempo che ci vorrebbe alla scala vera
  const h=Math.floor(t*SCALE_GEO/3600), mi=Math.round(t*SCALE_GEO%3600/60);
  return h?h+" h "+String(mi).padStart(2,"0"):mi+" min";
};
let LOG={passages:[],polar:{},best:{}};
let voy=null, challenge=null;

async function loadLog(){
  const d=await store.get("vela:log");
  if(d&&d.passages){LOG=d; if(!LOG.polar)LOG.polar={}; if(!LOG.best)LOG.best={};}
  logRender();
}
function saveLog(){ store.set("vela:log",LOG); }

function nearestPort(x,y){
  let b=null,bd=1e18;
  for(const o of (world.ports||[])){const d=Math.hypot(o.x-x,o.y-y); if(d<bd){bd=d;b=o;}}
  return b?b.n:"Mare aperto";
}
function decimate(tr,n){
  if(tr.length<=n) return tr;
  const out=[]; for(let i=0;i<n;i++) out.push(tr[Math.floor(i*(tr.length-1)/(n-1))]);
  return out;
}
function startVoyage(from){
  voy={from,t:0,dist:0,track:[],moving:false,ghost:null,delta:null};
  let key=null;
  if(challenge&&challenge.startsWith(from+" → ")) key=challenge;
  else{
    let bw=-1;
    for(const k in LOG.best) if(k.startsWith(from+" → ")&&LOG.best[k].when>bw){bw=LOG.best[k].when;key=k;}
  }
  if(key&&LOG.best[key]) voy.ghost={key,to:key.split(" → ")[1],...LOG.best[key]};
}
function voyUpdate(dt){
  if(!voy||!world.ports||!world.ports.length) return;
  const sp=Math.hypot(boat.vx,boat.vy);
  if(!voy.moving){ if(sp>0.7) voy.moving=true; else return; }
  voy.t+=dt; voy.dist+=sp*dt;
  const L=voy.track[voy.track.length-1];
  if(!L||Math.hypot(boat.x-L[0],boat.y-L[1])>30)
    voy.track.push([Math.round(boat.x),Math.round(boat.y),Math.round(voy.t*10)/10]);

  // polare personale: miglior rapporto velocità barca / velocità vento per settore
  const w=windAt(boat.x,boat.y);
  if(w.spd>2&&sp>0.3){
    const b="b"+Math.min(11,Math.floor(Math.abs(norm(w.from-boat.h))*R2D/15));
    const r=Math.round(sp/w.spd*1000)/1000;
    if(!LOG.polar[b]||r>LOG.polar[b]) LOG.polar[b]=r;
  }
  // confronto col fantasma: quanto tempo aveva impiegato lui per essere qui
  if(voy.ghost){
    let bd=1e18,bt=0;
    for(const q of voy.ghost.track){
      const d=(q[0]-boat.x)**2+(q[1]-boat.y)**2;
      if(d<bd){bd=d;bt=q[2];}
    }
    voy.delta=(bd<400*400)?voy.t-bt:null;
  }
  for(const o of world.ports){
    if(o.n===voy.from) continue;
    if(Math.hypot(boat.x-o.x,boat.y-o.y)<220){ arrive(o.n); return; }
  }
}
function arrive(to){
  const key=voy.from+" → "+to;
  const p={from:voy.from,to,t:voy.t,dist:voy.dist,when:Date.now()};
  const b=LOG.best[key];
  if(voy.t>30&&voy.dist>450){
    if(!b||voy.t<b.t){LOG.best[key]={t:voy.t,dist:voy.dist,when:p.when,track:decimate(voy.track,160)};p.rec=1;}
    LOG.passages.unshift(p);
    if(LOG.passages.length>80) LOG.passages.length=80;
    saveLog();
    say("Arrivato a "+to+" — "+fmtT(voy.t).split(".")[0]+" · "+nm(voy.dist).toFixed(1)+
        " nm · "+avgKn(voy.dist,voy.t).toFixed(1)+" kn di media"+(p.rec?"   ★ RECORD":""));
    logRender();
  }
  challenge=null;
  startVoyage(to);
}

/* ─ interfaccia del giornale ─ */
const logEl=document.getElementById("logbook");
logEl.addEventListener("pointerdown",e=>{if(e.target===logEl)toggleLog();});
function toggleLog(){
  logEl.classList.toggle("on");
  if(logEl.classList.contains("on")) logRender();
}
function logRender(){
  if(!logEl||!logEl.classList.contains("on")) return;
  const tot=LOG.passages.reduce((a,p)=>a+p.dist,0), tt=LOG.passages.reduce((a,p)=>a+p.t,0);
  document.getElementById("logsum").innerHTML=
    "<b>"+LOG.passages.length+"</b> traversate · <b>"+nm(tot).toFixed(1)+"</b> miglia · <b>"+
    fmtT(tt).split(".")[0]+"</b> al timone, pari a "+realT(tt)+" di navigazione vera"+
    "<span style='color:var(--chart-dim)'>   (salvataggio: "+storeKind+")</span>";
  const keys=Object.keys(LOG.best).sort();
  document.getElementById("logbest").innerHTML = keys.length? 
    "<table>"+keys.map(k=>{
      const b=LOG.best[k];
      return "<tr><td>"+k+"</td><td class='n'>"+fmtT(b.t).split(".")[0]+"</td><td class='n'>"+
        nm(b.dist).toFixed(1)+" nm</td><td class='n'>"+avgKn(b.dist,b.t).toFixed(1)+" kn</td>"+
        "<td><button data-r=\""+k+"\">Sfida</button></td></tr>";
    }).join("")+"</table>"
    : "<div class='empty'>Nessuna traversata registrata. Esci da un porto e arriva in un altro: viene salvata da sola.</div>";
  document.getElementById("logbest").querySelectorAll("button").forEach(b=>{
    b.onclick=e=>{
      const k=e.currentTarget.dataset.r;
      challenge=k;
      const from=k.split(" → ")[0];
      const i=(world.ports||[]).findIndex(o=>o.n===from);
      if(i>=0){portEl.value=i;startFrom(i);}
      toggleLog();
      say("Sfida: "+k+" — record "+fmtT(LOG.best[k].t).split(".")[0]);
    };
  });
  document.getElementById("loglast").innerHTML = LOG.passages.length?
    "<table>"+LOG.passages.slice(0,12).map(p=>
      "<tr><td>"+p.from+" → "+p.to+"</td><td class='n'>"+fmtT(p.t).split(".")[0]+
      "</td><td class='n'>"+nm(p.dist).toFixed(1)+" nm</td><td class='n'>"+
      avgKn(p.dist,p.t).toFixed(1)+" kn</td><td class='r'>"+(p.rec?"★":"")+"</td></tr>").join("")+"</table>":"";
  drawPolarChart();
}
function drawPolarChart(){
  const cv2=document.getElementById("polarcv"); if(!cv2)return;
  const g=cv2.getContext("2d"), W2=cv2.width=300, H2=cv2.height=300;
  const cx=W2/2, cy=H2/2+8, R=118;
  g.clearRect(0,0,W2,H2);
  const vmax=Math.max(7,polarSpeed(100,windBase)*1.94384*1.15);
  const rad=v=>v/vmax*R;
  g.strokeStyle="rgba(243,234,212,.14)";g.lineWidth=1;
  for(let k=2;k<=Math.floor(vmax);k+=2){
    g.beginPath();g.arc(cx,cy,rad(k),0,TAU);g.stroke();
    g.fillStyle="rgba(243,234,212,.30)";g.font="9px ui-monospace,monospace";g.textAlign="left";
    g.fillText(k+" kn",cx+3,cy-rad(k)-2);
  }
  for(let a=0;a<360;a+=30){
    const d=dv(a*D2R);
    g.strokeStyle="rgba(243,234,212,.10)";
    g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+d.x*R,cy+d.y*R);g.stroke();
  }
  g.fillStyle="rgba(243,234,212,.45)";g.font="9px ui-monospace,monospace";g.textAlign="center";
  g.fillText("VENTO",cx,cy-R-10);
  // curva teorica
  g.strokeStyle="rgba(127,196,122,.85)";g.lineWidth=1.8;g.beginPath();
  for(let a=0;a<=180;a+=4){
    const v=polarSpeed(a,windBase)*1.94384, d=dv(a*D2R);
    const x=cx+d.x*rad(v), y=cy+d.y*rad(v);
    a?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();
  g.save();g.scale(-1,1);g.translate(-2*cx,0);
  g.strokeStyle="rgba(127,196,122,.35)";g.beginPath();
  for(let a=0;a<=180;a+=4){
    const v=polarSpeed(a,windBase)*1.94384, d=dv(a*D2R);
    const x=cx+d.x*rad(v), y=cy+d.y*rad(v);
    a?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();g.restore();
  // punti personali
  let any=false;
  for(let b=0;b<12;b++){
    const r=LOG.polar["b"+b]; if(!r)continue; any=true;
    const a=(b*15+7.5), v=r*windBase*1.94384, d=dv(a*D2R);
    g.fillStyle=C("--accent");
    g.beginPath();g.arc(cx+d.x*rad(v),cy+d.y*rad(v),3.2,0,TAU);g.fill();
  }
  g.fillStyle="rgba(243,234,212,.5)";g.font="9px ui-monospace,monospace";g.textAlign="left";
  g.fillText("— teorico a "+(windBase*1.94384).toFixed(0)+" kn di vento",10,H2-16);
  g.fillStyle=C("--accent");
  g.fillText(any?"• tuo massimo per settore":"• nessun dato tuo ancora",10,H2-4);
}

/* ══════════════════ tutorial ══════════════════ */
/* Ogni passo ha un obiettivo verificabile sullo stato della barca e mette in
   evidenza lo strumento di cui parla, così si impara guardando la cosa giusta. */
const tut={on:false,i:0,hold:0,mem:{},t:0};
const kn=()=>Math.hypot(boat.vx,boat.vy)*1.94384;
const twaNow=()=>norm(windAt(boat.x,boat.y).from-boat.h);

const TUT=[
{ttl:"Benvenuto a bordo",hi:null,manual:true,
 txt:"Undici metri, randa e fiocco. In pochi minuti vediamo <b>cosa guardare</b> per non trovarti mai fermo senza capire perché. Puoi chiudere il tutorial quando vuoi."},

{ttl:"Da dove viene il vento",hi:"rose",manual:true,
 txt:"I <b>tratteggi</b> sull'acqua scorrono nella direzione in cui soffia il vento: più sono lunghi e chiari, più è forte. Nella <b>rosa</b> in alto a destra la freccia arancione indica da dove viene, e il settore giallo è la zona in cui non puoi navigare. La rosa è orientata a prua: sta ferma la barchetta e gira il mondo."},

{ttl:"La barra",hi:"rudder",init(){tut.mem.h0=boat.h;},
 txt:"Le <b>frecce sinistra e destra</b> muovono la barra, che <b>resta dove la lasci</b>: non torna al centro da sola. Sull'indicatore TIMONE il segno chiaro è dove l'hai messa, quello pieno è dove è arrivata la pala. <b>Spazio</b> la rimette dritta.",
 goal:"Accosta finché la rotta è cambiata di 60°",
 ok:()=>Math.abs(norm(boat.h-tut.mem.h0))>60*D2R},

{ttl:"Regolare le vele",hi:"sails",hold:2.5,
 txt:"Le due barre in basso a sinistra sono la <b>posizione delle scotte</b>: tutta cazzata a sinistra, tutta lascata a destra. La <b>fascia verde</b> è dove la scotta dovrebbe stare adesso. Porta il segno bianco dentro il verde con <b>↑↓</b> per la randa e <b>Q E</b> per il fiocco. Guarda anche le vele: diventano bianche col bordo verde quando sono giuste.",
 goal:"Tieni entrambe le vele nella fascia verde per 2 secondi",
 ok:()=>boat.stM==="ottima"&&(boat.stJ==="ottima"||boat.stJ==="aperta")},

{ttl:"Il vento apparente",hi:"sails",
 txt:"Muovendoti, il vento che senti a bordo gira verso prua. Per questo la <b>fascia verde si sposta a sinistra man mano che acceleri</b>: devi cazzare ancora un po'. È il motivo per cui in barca si regola in continuazione.",
 goal:"Supera i 4,5 nodi tenendo le vele a posto",
 ok:()=>kn()>4.5},

{ttl:"Il muro del vento",hi:"sails",
 txt:"Adesso rompiamo qualcosa apposta. <b>Orza</b>, cioè gira verso il vento, e continua. Vedrai le vele diventare <b>ambra e trasparenti</b>, i filetti rossi sollevarsi, e la barca fermarsi. Entro ~35° dal vento non si naviga: si chiama essere <b>in panne</b>.",
 goal:"Fermati con la prua nel vento (sotto 1,2 nodi)",
 ok:()=>kn()<1.2&&Math.abs(boat.beta)<45*D2R},

{ttl:"Uscire dalla panne",hi:"sails",init(){tut.mem.used=false;},
 txt:"Da fermo il timone non serve a niente: senza acqua che scorre sulla pala non gira niente. La manovra vera è il <b>fiocco a collo</b>: premi <b>B</b>. Il fiocco viene tenuto dal lato sbagliato, diventa azzurro, e il vento spinge la prua sottovento. Aiuta anche lascare la randa.",
 goal:"Premi B e fai cadere la prua oltre i 65° dal vento",
 ok(){if(boat.jibBack)tut.mem.used=true;
      return tut.mem.used&&Math.abs(boat.beta)>65*D2R&&kn()>1.5;}},

{ttl:"Il bilanciamento",hi:"balance",hold:6,
 txt:"La <b>randa</b> tira a poppavia del centro della barca e la fa <b>orzare</b>; il <b>fiocco</b> tira a prua e la fa <b>puggiare</b>. La barra dell'indicatore BILANCIAMENTO dice chi sta vincendo. Portala al centro cazzando o lascando una delle due, e la barca tiene la rotta da sola. È il vero motivo per cui in barca si toccano le scotte, non il timone.",
 goal:"Naviga sopra i 3 nodi con bilanciamento neutro e barra quasi al centro, per 6 secondi",
 ok:()=>kn()>3&&Math.abs(boat.balance)<0.28&&Math.abs(boat.rudderCmd)<0.18},

{ttl:"Le raffiche",hi:null,
 txt:"Le <b>macchie scure</b> sull'acqua sono raffiche: dentro, i tratteggi si allungano e corrono. Ti danno più velocità ma anche più sbandamento, e spesso ruotano un po' il vento. Vederle arrivare da sopravvento ti dà il tempo di prepararti.",
 goal:"Entra dentro una raffica",
 ok:()=>windAt(boat.x,boat.y).spd>windBase*1.09},

{ttl:"Andature portanti",hi:"sails",hold:1.5,
 txt:"Più poggi, più le vele vanno tenute <b>perpendicolari al vento</b>: l'angolo migliore passa da 27° di bolina a 90° in poppa. Non esiste una regolazione buona per tutte le andature — per questo la fascia verde si sposta parecchio. Seguila e basta.",
 goal:"Porta il vento oltre i 150° con entrambe le vele nel verde",
 ok:()=>Math.abs(twaNow())>150*D2R&&(boat.stM==="aperta"||boat.stM==="ottima")
        &&(boat.stJ==="aperta"||boat.stJ==="ottima")},

{ttl:"Lo spinnaker",hi:"instr",
 txt:"Scappando davanti al vento te ne porti via una parte: il vento apparente crolla e la pressione sulle vele quasi si dimezza. Se qui la velocità non sale non è colpa della regolazione, sono le <b>vele sbagliate</b>. Premi <b>G</b>: lo spinnaker è tre volte il fiocco e resta molto meno coperto dalla randa. Si regola con <b>Q E</b>. Di bolina però si sgonfia, quindi ammainalo prima di risalire il vento.",
 goal:"Issa lo spinnaker e supera i 5,5 nodi",
 ok:()=>boat.spi&&kn()>5.5},

{ttl:"Autotimoniere",hi:"rudder",
 txt:"<b>Z</b> cambia il modo di governo in quattro passi. <b>Richiamo al centro</b>: la barra torna dritta da sola se la molli, come con un elastico. <b>Rotta</b>: mantiene la direzione bussola. <b>Vento</b>: mantiene l'angolo col vento apparente, come un autotimoniere a vento vero. <b>Barra libera</b>: resta dove la metti. Negli ultimi due le frecce spostano la rotta impostata invece di muovere la barra.",
 goal:"Inserisci l'autotimoniere con Z",
 ok:()=>game.pilot!==0},

{ttl:"Sei pronto",hi:null,manual:true,
 txt:"Riassunto: <b>colore delle vele</b> per capire se tirano, <b>fascia verde</b> per sapere dove mettere la scotta, <b>bilanciamento</b> per non combattere col timone, <b>B</b> se ti pianti. Adesso ci sono sei boe da girare in ordine, con il cronometro. <b>H</b> riapre i comandi in qualsiasi momento."}
];

const tutEl=document.getElementById("tut");
function tutRender(){
  const st=TUT[tut.i];
  document.getElementById("tutnum").textContent=(tut.i+1)+"/"+TUT.length;
  document.getElementById("tutttl").textContent=st.ttl;
  document.getElementById("tuttxt").innerHTML=st.txt;
  const g=document.getElementById("tutgoal");
  g.textContent=st.goal?"▸ "+st.goal:"";
  g.style.display=st.goal?"block":"none";
  document.getElementById("tutnext").style.display=st.manual?"inline-block":"none";
  document.getElementById("tutskip").style.display=st.manual?"none":"inline-block";
}
function tutStart(){
  tut.on=true;tut.i=0;tut.hold=0;tut.mem={};tut.t=0;
  game.auto=false;game.pilot=0;
  resetBoat();
  tutEl.classList.add("on");tutRender();
}
function tutNext(){
  tut.i++;tut.hold=0;tut.mem={};tut.t=0;
  if(tut.i>=TUT.length){tutQuit();return;}
  if(TUT[tut.i].init)TUT[tut.i].init();
  tutRender();
}
function tutQuit(){tut.on=false;tutEl.classList.remove("on");say("Buon vento — sei ai comandi");}
function tutUpdate(dt){
  if(!tut.on)return;
  const st=TUT[tut.i];tut.t+=dt;
  if(st.manual||!st.ok)return;
  if(st.ok()){
    tut.hold+=dt;
    if(tut.hold>=(st.hold||0.4)){say("✓ "+st.ttl);tutNext();}
  }else tut.hold=Math.max(0,tut.hold-dt*1.5);
  const g=document.getElementById("tutgoal");
  if(st.hold&&tut.hold>0.05) g.textContent="▸ "+st.goal+"   ("+Math.max(0,(st.hold-tut.hold)).toFixed(1)+" s)";
  else if(st.goal) g.textContent="▸ "+st.goal;
}
function tutHighlight(){
  if(!tut.on)return;
  const key=TUT[tut.i].hi;if(!key)return;
  const P={
    rose:  [VW-196,10,188,188],
    instr: [10,10,204,134],
    sails: [10,VH-196,314,84],
    balance:[10,VH-118,314,48],
    rudder:[10,VH-72,314,58]
  }[key];
  if(!P)return;
  const p=0.5+0.5*Math.sin(game.t*3.2);
  ctx.strokeStyle="rgba(226,102,45,"+(0.35+0.5*p).toFixed(2)+")";
  ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.lineDashOffset=-game.t*14;
  ctx.strokeRect(P[0]+.5,P[1]+.5,P[2],P[3]);
  ctx.setLineDash([]);
}
document.getElementById("tutnext").onclick=e=>{e.currentTarget.blur();tutNext();};
document.getElementById("tutskip").onclick=e=>{e.currentTarget.blur();tutNext();};
document.getElementById("tutquit").onclick=e=>{e.currentTarget.blur();tutQuit();};
document.getElementById("tutb").onclick=e=>{e.currentTarget.blur();tutStart();};

/* ══════════════════ loop ══════════════════ */
newWorld("mantova");
loadLog();
helpEl.classList.add("on");
let last=performance.now();
function frame(now){
  let dt=clamp((now-last)/1000,0,0.05);last=now;   // mai negativo: un timestamp anomalo faceva esplodere la fisica
  if(!game.paused && !chart.on && !helpEl.classList.contains("on") && !askEl.classList.contains("on")
     && !logEl.classList.contains("on")){
    const sdt=dt*timeScale;                              // il tempo simulato scorre più in fretta
    game.t+=sdt;
    input(sdt);
    autopilot(sdt);
    updateWind(sdt);
    trimWindows();
    const n=Math.max(2,Math.ceil(sdt/0.02)), sd=sdt/n;   // passi corti: la fisica resta stabile
    for(let i=0;i<n;i++) physics(sd);
    voyUpdate(sdt);
    tutUpdate(sdt);
    if(game.msgT>0)game.msgT-=dt;                        // gli avvisi durano in tempo reale
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
