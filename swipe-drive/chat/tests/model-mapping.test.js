/* Run with: node swipe-drive/chat/tests/model-mapping.test.js */
var path=require("path");global.window=global;require(path.join(__dirname,"..","onboard-core.js"));var O=global.Onboard;
var Q={id:"model",type:"model",chips:["X1","3 Series","X3","i4","Not sure yet"]};
var CUR={id:"cur",type:"anycar",chips:["No current car","Not sure"]};
var cases=[["1 series","1 Series"],["1 Series","1 Series"],["2 series","2 Series"],["3 series","3 Series"],["4 series","4 Series"],["5 series","5 Series"],["7 series","7 Series"],["8 series","8 Series"],
["2 series gran coupe","2 Series Gran Coupe"],["2 Series Active Tourer","2 Series Active Tourer"],["4 series gran coupe","4 Series Gran Coupe"],["3 series touring","3 Series Touring"],["5 series touring","5 Series Touring"],
["x1","X1"],["X2","X2"],["x3","X3"],["x4","X4"],["x5","X5"],["x6","X6"],["x7","X7"],["XM","XM"],["z4","Z4"],["i4","i4"],["i5","i5"],["i7","i7"],["ix","iX"],["iX1","iX1"],["ix2","iX2"],["iX3","iX3"],
["m2","M2"],["M3","M3"],["m4","M4"],["m5","M5"],["m8","M8"],["one series","1 Series"],["three series","3 Series"],["3er","3 Series"],["320d","3 Series"],["118i","1 Series"],["530e","5 Series"],["m340i","3 Series"],["m135i","1 Series"],
["x5 m50","X5"],["x5 m","X5 M"],["x3 m40d","X3"],["bmw x1","X1"],["BMW 1 Series","1 Series"],["a 1 series please","1 Series"],["i think the x3","X3"],["probably a 3 series touring","3 Series Touring"],["not sure","Not sure yet"],["Not sure yet","Not sure yet"],["mini","Mini"]];
var bad=["6 series","banana","audi a4","9 series","asdfgh"];
var f=0,p=0;
cases.forEach(function(c){var r=O.check(Q,c[0]);if(r.ok&&r.val===c[1])p++;else{f++;console.log("FAIL",JSON.stringify(c[0]),"expected",c[1],"got",JSON.stringify(r))}});
bad.forEach(function(s){var r=O.check(Q,s);if(!r.ok)p++;else{f++;console.log("FAIL should reject",s,JSON.stringify(r))}});
[["2019 Audi A3 diesel","2019 Audi A3 diesel"],["audi a4","audi a4"],["2018 BMW 320d","2018 BMW 320d"],["x3","X3"],["1 series","1 Series"],["none","No current car"]].forEach(function(c){var r=O.check(CUR,c[0]);if(r.ok&&r.val===c[1])p++;else{f++;console.log("FAIL cur",c[0],JSON.stringify(r))}});
console.log(p+" passed, "+f+" failed");process.exit(f?1:0);
