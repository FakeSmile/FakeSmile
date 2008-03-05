// ==UserScript==
// @name           smil
// @namespace      svg.smil
// ==/UserScript==

var svgns="http://www.w3.org/2000/svg";
var xlinkns="http://www.w3.org/1999/xlink";
var mpf = 10; // milliseconds per frame

var animators = new Array();  // all animators
var id2anim = new Object();   // id -> animator
var animations = new Array(); // running animators

/**
 * if declarative animations are not supported,
 * the document animations are fetched and registered
 */
function initSMIL() {
  if(!document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#SVG-animation", "1.1")) {

    var animates = document.getElementsByTagName("*");
    for(var j=0; j<animates.length ;j++) {
      var anim = animates.item(j);
      var namespaceURI = anim.namespaceURI;
      if (namespaceURI!=svgns)
        continue;
      var nodeName = anim.localName;
      if (nodeName=="set" || nodeName=="animate" || nodeName=="animateColor" || nodeName=="animateMotion" || nodeName=="animateTransform") {
        var animator = new Animator(anim);
        animators.push(animator);
        var id = anim.getAttribute("id");
        if (id)
          id2anim[id] = animator;
      }
    }
    
    // I schedule them (after having instanciating them, for sync-based events)
    for (var i=0; i<animators.length; i++)
      animators[i].register();
    
    // starts the rendering loop
    window.setInterval(animate, mpf);
  }
}

/**
 * corresponds to one <animate>, <set>, <animateTransform>, ...
 */
Animator.prototype = {

  /**
   * Registers the animation.
   * It schedules the beginings and endings
   */
  register : function() {
    var begin = this.anim.getAttribute("begin");
    if (!begin)
      begin = "0";
    this.schedule(begin, this.begin);
    var end  = this.anim.getAttribute("end");
    if (end)
      this.schedule(end, this.finish);
  },
  
  /**
   * schedules the starts or ends of the animation
   */
  schedule : function(timeValueList, func) {
    var me = this; // I do that because if I use "this", the addEventListener understands the event source
    var timeValues = timeValueList.split(";");
    for(var i=0; i<timeValues.length ;i++) {
      var time = timeValues[i].trim();
      if(isNaN(parseInt(time))) {
        var offset = 0;
        var io = time.indexOf("+");
        if (io==-1)
          io = time.indexOf("-");
        if (io!=-1) {
          offset = toMillis(time.substring(io));
          time = time.substring(0, io);
        }
        io = time.indexOf(".");
        var element;
        if (io==-1)
          element = this.anim.parentNode;
        else {
          var id = time.substring(0, io);
          element = id2anim[id];
          if(element==null)
            element = document.getElementById(id);
        }
        if(element==null)
          continue;
        var event = time.substring(io+1);
        
        var call = function() {func.call(me, offset)}; 
        element.addEventListener(event, call, false);
      } else {
        time = toMillis(time);
        func.call(me, time);
      }
    }
  },
  
  /**
   * Remembers the initial value of the animated attribute.
   * This function is overriden
   */
  recordInitVal : function() {
    var attributeType = this.attributeType;
    var attributeName = this.attributeName;
    if (attributeType=="CSS")
      this.initVal = this.target.style.getPropertyValue(attributeName);
    else if (attributeType=="XML")
      this.initVal = this.target.getAttribute(attributeName);
    else
      this.initVal = this.target.getAttribute(attributeName);
   
    if (!this.initVal && propDefaults[attributeName] )
      this.initVal = propDefaults[attributeName];
  },
  
  /**
   * starts the animation
   * I mean the very beginning of it.
   * not called when repeating
   */
  begin : function(offset) {
    if (offset && offset>0) {
      var me = this;
      var myself = this.begin;
      var call = function() {myself.call(me)};
      window.setTimeout(call, offset);
      return;
    }

    this.stop();
    this.running = true;
    if (this.anim.nodeName=="set")
      this.step(this.to);
    // what does dur="indefinite" mean anyway ?
    // it makes sense for <set> only, I think.
    var dur = this.dur;
    if (dur==null || dur=="" || dur=="indefinite")
      return;
    this.repeat = this.repeatCount;
    this.recordInitVal();
    this.start();
    if (offset && offset<0)
      this.dateBegin.setTime(this.dateBegin.getTime()+offset);
    animations.push(this);
    for(var i=0; i<this.beginListeners.length ;i++)
      this.beginListeners[i].call();
  },
  
  /**
   * This function is overriden for multiple values attributes (scale, rotate, translate)
   */
  normalize : function(value) {
    return parseFloat(value);
  },

  /**
   * called when started or repeating
   */
  start : function() {
    this.dateBegin = new Date();
    if (this.from)
      this.currFrom = this.from;
    else
      this.currFrom = this.initVal;
    if (this.by && this.currFrom)
      this.currTo = this.add(this.normalize(this.currFrom), this.normalize(this.by));
    else
      this.currTo = this.to;
  },
  
  /**
   * Sums up two normalized values
   */
  add : function(from, by) {
    return from+by;
  },

  /**
   * Overridden in case of values list
   */
  getLocalFromTo : function(percent) {
    return [this.currFrom, this.currTo, percent];
  },
  
  /**
   * Computes and apply the animated value for a given time
   * It returns false if this animation has been stopped (removed from the running array)
   */
  f : function(curTime) {
    var anim = this.anim;
    
    var dur = this.computedDur;
    var values = this.values;

    var beginTime = this.dateBegin;

    var diff = curTime-beginTime;
    var percent = diff/dur;
    if (percent>=1)
      return this.end();
    if (anim.localName=="set")
      return true;
      
    var repeatCount = parseFloat(this.repeat);
    if (!isNaN(repeatCount) && percent>parseFloat(repeatCount))
      return true;

    var fromTo = this.getLocalFromTo(percent);
    var curVal = this.interpolate(this.normalize(fromTo[0]), this.normalize(fromTo[1]), fromTo[2]);

    this.step(curVal);
    return true;
  },

  /**
   * Does the interpolation
   * This function is overriden
   */ 
  interpolate : function(from, to, percent) {
    return from+((to-from)*percent);
  },


  /**
   * apply a value to the attribute the animator is linked to
   * This function is overriden
   */
  step : function(value) {
    var attributeType = this.attributeType;
    var attributeName = this.attributeName;
    if (attributeType=="CSS")
      this.target.style.setProperty(attributeName, value, "");
    else if (attributeType=="XML")
      this.target.setAttribute(attributeName, value);
    else
      this.target.setAttribute(attributeName, value);
  },
  
  /**
   * Normal end of the animation:
   * it restarts if repeatCount
   */
  end : function() {
    if(this.repeat=="indefinite")
      this.start();
    else if (this.repeat==null || this.repeat=="")
      return this.finish();
    else {
      this.repeat--;
      if (this.repeat>0)
        this.start();
      else 
        return this.finish();
    }
    return true;
  },
  
  /**
   * Real stop of the animation (it doesn't repeat)
   * Freezes or remove the animated value
   */
  finish : function(offset) {
    if (offset && offset>0) {
      var me = this;
      var myself = this.finish;
      var call = function() {myself.call(me)};
      window.setTimeout(call, offset);
      return;
    }
    var fill = this.fill;
    var kept = true;
    if (fill=="freeze") {
      this.freeze();
    } else {
      this.stop();
      this.step(this.initVal);
      kept = false;
    }
    if (this.running) {
      for(var i=0; i<this.endListeners.length ;i++)
        this.endListeners[i].call();
      this.running = false;
    }
    return kept;
  },
  
  /**
   * Removes this animation from the running array
   */
  stop : function() {
    for(var i=0; i<animations.length ;i++)
      if (animations[i]==this) {
        animations.splice(i, 1);
        break;
      }
  },

  /**
   * freezes the attribute value to the ending value
   */
  freeze : function() {
    this.step(this.to);
  },
  
  /**
   * Adds a listener to this animation beginning or ending
   */
  addEventListener : function(event, func, b) {
    if (event=="begin")
      this.beginListeners.push(func);
    else if (event=="end")
      this.endListeners.push(func);
  },
  
  /**
   * Returns the path linked to this animateMotion
   */
  getPath : function() {
    var mpath = this.anim.getElementsByTagNameNS(svgns,"mpath")[0];
    if (mpath) {
      var pathHref = mpath.getAttributeNS(xlinkns, "href");
      return document.getElementById(pathHref.substring(1));
    } else {
      var path = this.anim.getAttribute("path");
      if (path) {
        var pathEl = document.createElementNS(svgns, "path");
        pathEl.setAttribute("d", path);
        pathEl.setAttribute("display", "none");
        this.anim.parentNode.appendChild(pathEl);
        return pathEl;
      }
    }
    return null;  
  },
  
  /**
   * initializes this animator as a translation :
   * <animateTransform type="translate"> or
   * <animateMotion> without a path
   */
  translation : function() {
    if (this.by && this.by.indexOf(",")==-1)
      this.by = this.by+",0";
    this.normalize = function(value) {
      var coords = value.split(",");
      if (coords.length==1)
        coords[1] = this.initVal.split(",")[1];
      coords[0] = parseFloat(coords[0]);
      coords[1] = parseFloat(coords[1]);
      return coords;
    };
    this.add = function(from, by) {
      var x = from[0]+by[0];
      var y = from[1]+by[1];
      return x+","+y;
    };
    this.interpolate = function(from, to, percent) {
      var x = from[0]+((to[0]-from[0])*percent);
      var y = from[1]+((to[1]-from[1])*percent);
      return x+","+y;
    };
  },
  
  /**
   * initializes this animator as a color animation :
   * <animateColor> or
   * <animate> ona a color attribute
   */
  color : function() {
    this.interpolate = function(from, to, percent) {
      var r = Math.round(from[0]+((to[0]-from[0])*percent));
      var g = Math.round(from[1]+((to[1]-from[1])*percent));
      var b = Math.round(from[2]+((to[2]-from[2])*percent));
      var val = "rgb("+r+","+g+","+b+")";
      return val;
    };
    this.normalize = function(value) {
      return toRGB(value);
    }
    this.add = function(from, by) {
      var ret = new Array();
      for (var i=0; i<from.length ;i++)
        ret.push(Math.min(from[i],255)+Math.min(by[i],255));
      return ret.join(",");
    };
  },
  
};
/**
 * contructor : 
 * - initializes
 * - gets the attributes
 * - corrects and precomputes some values
 * - specializes some functions
 */
function Animator(anim) {
  this.anim = anim;
  var href = anim.getAttributeNS(xlinkns, "href");
  if (href!="")
    this.target = document.getElementById(href.substring(1))
  else
    this.target = anim.parentNode;
  this.attributeType = anim.getAttribute("attributeType");
  this.attributeName = anim.getAttribute("attributeName");
  this.from = anim.getAttribute("from");
  this.to = anim.getAttribute("to");
  this.by = anim.getAttribute("by");
  this.values = anim.getAttribute("values");
  if (this.values) {
    var tValues = this.values.split(";");
    this.to = tValues[tValues.length-1];
    this.getLocalFromTo = function(percent) {
      var tValues = this.values.split(";");
      if (percent==1)
        return [tValues[tValues.length-2], tValues[tValues.length-1], percent];
      var parts = tValues.length-1;
      var div = Math.floor(percent*parts);
      var mod = percent%(1/parts);
      return [tValues[div], tValues[div+1], mod*parts];
    };
  }
  this.dur = anim.getAttribute("dur");
  if (this.dur!=null && this.dur!="" && this.dur!="indefinite")
    this.computedDur = toMillis(this.dur);
  this.fill = anim.getAttribute("fill");
  this.type = anim.getAttribute("type");
  this.repeatCount = anim.getAttribute("repeatCount");
  
  this.beginListeners = new Array();
  this.endListeners = new Array();
  
  var nodeName = anim.localName;

  if (nodeName=="animate") {

    if ((this.from && this.from.substring(0,1)=="#") || (this.to && this.to.substring(0,1)=="#"))
      this.color();

  } else if (nodeName=="animateColor") {
  
    this.color();

  } else if (nodeName=="animateMotion") {
  
    this.recordInitVal = function() {
      var attributeType = this.attributeType;
      var attributeName = this.attributeName;
      var type = this.type;
      transList = this.target.transform.animVal;
      if (transList.numberOfItems>0)
        this.initVal = decompose(transList.getItem(0).matrix, "translate");
      else
        this.initVal = "0,0";
    };
    this.path = this.getPath();
    if (this.path) {
      this.interpolate = function(from, to, percent) {
        var length = this.path.getTotalLength();
        var point = this.path.getPointAtLength(percent*length);
        return point.x+","+point.y;
      };
      try {
        var point = this.path.getPointAtLength(this.path.getTotalLength());  
        this.to = point.x+","+point.y;
      } catch(exc) { // a bug ?
        this.freeze = function() {
          var point = this.path.getPointAtLength(this.path.getTotalLength());
          this.step(point.x+","+point.y);
        };
      }
    } else {
      this.translation();
    }
    this.step = function(value) {
      var attributeName = this.attributeName;
      value = "translate("+value+")";
      this.target.setAttribute("transform", value);
    };
    
  } else if (nodeName=="animateTransform") {
  
    this.recordInitVal = function() {
      var attributeType = this.attributeType;
      var attributeName = this.attributeName;
      var type = this.type;
      transList = this.target.transform.animVal;
      if (transList.numberOfItems>0) {
        this.initVal = decompose(transList.getItem(0).matrix, type);
      } else {
        if (type=="scale")
          this.initVal = "1,1";
        else if (type=="translate")
          this.initVal = "0,0";
        else if (type=="rotate")
          this.initVal = "0,0,0";
        else
          this.initVal = 0;
      }
    };
    
    if (this.type=="scale") {
      this.normalize = function(value) {
        var coords = value.split(",");
        if (coords.length==1)
          coords[1] = coords[0];
        coords[0] = parseFloat(coords[0]);
        coords[1] = parseFloat(coords[1]);
        return coords;
      };
    } else if (this.type=="translate") {
      this.translation();
    } else if (this.type=="rotate") {
      this.normalize = function(value) {
        var coords = value.split(",");
        if (coords.length<3) {
          coords[0] = parseFloat(coords[0]);
          coords[1] = 0;
          coords[2] = 0;
        } else {
          coords[0] = parseFloat(coords[0]);
          coords[1] = parseFloat(coords[1]);
          coords[2] = parseFloat(coords[2]);
        }
        return coords;
      };
    }
    
    if (this.type=="scale" || this.type=="rotate") {
      if (this.from)
        this.from = this.normalize(this.from).join(",");
      if (this.to)
        this.to = this.normalize(this.to).join(",");
      if (this.by)
        this.by = this.normalize(this.by).join(",");
      this.add = function(from, by) {
        var ret = new Array();
        for (var i=0; i<from.length ;i++)
          ret.push(from[i]+by[i]);
        return ret.join(",");
      };
      this.interpolate = function(from, to, percent) {
        var ret = new Array();
        for (var i=0; i<from.length ;i++)
          ret.push(from[i]+((to[i]-from[i])*percent));
        return ret.join(",");
      };
    }
    
    this.step = function(value) {
      var attributeName = this.attributeName;
      value = this.type+"("+value+")";
      this.target.setAttribute(attributeName, value);
    };
  }
  
  var me = this;
  this.anim.beginElement = function() { me.begin(); return true; };
  this.anim.beginElementAt = function(offset) { me.begin(offset*1000); return true; };
  this.anim.endElement = function() { me.finish(); return true; };
  this.anim.endElementAt = function(offset) { me.finish(offset*1000); return true; };
}



/**
 * can be called at any time.
 * It's the main loop
 */
function animate() {
  var curTime = new Date();
  for(var i=0; i<animations.length ;i++) {
    try {
      if (!animations[i].f(curTime))
        i--;
    } catch(exc) {
      //console.log(exc);
    }
  }
  // it would be cool if the attributes would be computed only, in the previous loop
  // and then the last values applied after the loop
  // for that, f(t) must return the value, and we must have a map for object(?).attributeType.attributeName -> value
  // then f(t) cannot return false when autostoping -> we must find another mechanism
}



/**
 * converts a clock-value to milliseconds
 * supported : "s" | "ms" | "min" | "h" | no-units
 */
function toMillis(time) {
  time = time.trim();
  var len = time.length;
  if (len>2 && time.substring(len-2)=="ms") {
    time = time.substring(0, time.length-2);
  } else if (len>1 && time.substring(len-1)=="s") {
    time = time.substring(0, time.length-1);
    time = time*1000;
  } else if (len>3 && time.substring(len-3)=="min") {
    time = time.substring(0, time.length-3);
    time = time*60000;
  } else if (len>1 && time.substring(len-1)=="h") {
    time = time.substring(0, time.length-1);
    time = time*3600000;
  } else {
    time = time*1000;
  }
  return parseFloat(time);
}

/**
 * decompose a matrix into its scale or translate or rotate or skew
 */
function decompose(matrix, type) {
  if (type=="translate")
    return matrix.e+","+matrix.f;
    
  var a = matrix.a;
  var b = matrix.b;
  var c = matrix.c;
  var d = matrix.d;
  
  if (type=="rotate")
    return Math.atan2(c,a)+",0,0";
  
  var ModA = Math.sqrt(a*a+c*c);
  var ModB = Math.sqrt(b*b+d*d);
  
  if (type=="scale") {
    var AxB = a*d-b*c;
    var scaleX = AxB/ModA;
    var scaleY = ModB;
    return scaleX+","+scaleY;
  }
  var AdotB = a*b+c*d;
  var shear = Math.PI/2-Math.acos(AdotB/(ModB*ModA));
  return (shear*180)/Math.PI;
}

/**
 * Convert a rgb(), #XXX, #XXXXXX or named color
 * into an [r,g,b] array
 */
function toRGB(color) {
  if (color.substring(0, 3)=="rgb") {
    color = color.replace(' ', '');
    color = color.replace('rgb(', '');
    color = color.replace(')', '');
    var rgb = color.split(',');
    rgb[0] = parseInt(rgb[0]);
    rgb[1] = parseInt(rgb[1]);
    rgb[2] = parseInt(rgb[2]);
    return rgb;
  } else if (color.charAt(0)=='#') {
    color = color.trim();
    var rgb = new Array();
    if (color.length==7) {
      rgb[0] = parseInt(color.substring(1,3),16);
      rgb[1] = parseInt(color.substring(3,5),16);
      rgb[2] = parseInt(color.substring(5,7),16);
    } else {
      rgb[0] = parseInt(color.substring(1,2),16)*17;
      rgb[1] = parseInt(color.substring(2,3),16)*17;
      rgb[2] = parseInt(color.substring(3,4),16)*17;
    }
    return rgb;
  } else {
    return colors[color];
  }
}

var colors = {
  aliceblue : [240, 248, 255], 
  antiquewhite : [250, 235, 215], 
  aqua : [0, 255, 255], 
  aquamarine : [127, 255, 212], 
  azure : [240, 255, 255], 
  beige : [245, 245, 220], 
  bisque : [255, 228, 196], 
  black : [0, 0, 0], 
  blanchedalmond : [255, 235, 205], 
  blue : [0, 0, 255], 
  blueviolet : [138, 43, 226], 
  brown : [165, 42, 42], 
  burlywood : [222, 184, 135], 
  cadetblue : [95, 158, 160], 
  chartreuse : [127, 255, 0], 
  chocolate : [210, 105, 30], 
  coral : [255, 127, 80], 
  cornflowerblue : [100, 149, 237], 
  cornsilk : [255, 248, 220], 
  crimson : [220, 20, 60], 
  cyan : [0, 255, 255], 
  darkblue : [0, 0, 139], 
  darkcyan : [0, 139, 139], 
  darkgoldenrod : [184, 134, 11], 
  darkgray : [169, 169, 169], 
  darkgreen : [0, 100, 0], 
  darkgrey : [169, 169, 169], 
  darkkhaki : [189, 183, 107], 
  darkmagenta : [139, 0, 139], 
  darkolivegreen : [85, 107, 47], 
  darkorange : [255, 140, 0], 
  darkorchid : [153, 50, 204], 
  darkred : [139, 0, 0], 
  darksalmon : [233, 150, 122], 
  darkseagreen : [143, 188, 143], 
  darkslateblue : [72, 61, 139], 
  darkslategray : [47, 79, 79], 
  darkslategrey : [47, 79, 79], 
  darkturquoise : [0, 206, 209], 
  darkviolet : [148, 0, 211], 
  deeppink : [255, 20, 147], 
  deepskyblue : [0, 191, 255], 
  dimgray : [105, 105, 105], 
  dimgrey : [105, 105, 105], 
  dodgerblue : [30, 144, 255], 
  firebrick : [178, 34, 34], 
  floralwhite : [255, 250, 240], 
  forestgreen : [34, 139, 34], 
  fuchsia : [255, 0, 255], 
  gainsboro : [220, 220, 220], 
  ghostwhite : [248, 248, 255], 
  gold : [255, 215, 0], 
  goldenrod : [218, 165, 32], 
  gray : [128, 128, 128], 
  grey : [128, 128, 128], 
  green : [0, 128, 0], 
  greenyellow : [173, 255, 47], 
  honeydew : [240, 255, 240], 
  hotpink : [255, 105, 180], 
  indianred : [205, 92, 92], 
  indigo : [75, 0, 130], 
  ivory : [255, 255, 240], 
  khaki : [240, 230, 140], 
  lavender : [230, 230, 250], 
  lavenderblush : [255, 240, 245], 
  lawngreen : [124, 252, 0], 
  lemonchiffon : [255, 250, 205], 
  lightblue : [173, 216, 230], 
  lightcoral : [240, 128, 128], 
  lightcyan : [224, 255, 255], 
  lightgoldenrodyellow : [250, 250, 210], 
  lightgray : [211, 211, 211], 
  lightgreen : [144, 238, 144], 
  lightgrey : [211, 211, 211], 
  lightpink : [255, 182, 193], 
  lightsalmon : [255, 160, 122], 
  lightseagreen : [32, 178, 170], 
  lightskyblue : [135, 206, 250], 
  lightslategray : [119, 136, 153], 
  lightslategrey : [119, 136, 153], 
  lightsteelblue : [176, 196, 222], 
  lightyellow : [255, 255, 224], 
  lime : [0, 255, 0], 
  limegreen : [50, 205, 50], 
  linen : [250, 240, 230], 
  magenta : [255, 0, 255], 
  maroon : [128, 0, 0], 
  mediumaquamarine : [102, 205, 170], 
  mediumblue : [0, 0, 205], 
  mediumorchid : [186, 85, 211], 
  mediumpurple : [147, 112, 219], 
  mediumseagreen : [60, 179, 113], 
  mediumslateblue : [123, 104, 238], 
  mediumspringgreen : [0, 250, 154], 
  mediumturquoise : [72, 209, 204], 
  mediumvioletred : [199, 21, 133], 
  midnightblue : [25, 25, 112], 
  mintcream : [245, 255, 250], 
  mistyrose : [255, 228, 225], 
  moccasin : [255, 228, 181], 
  navajowhite : [255, 222, 173], 
  navy : [0, 0, 128], 
  oldlace : [253, 245, 230], 
  olive : [128, 128, 0], 
  olivedrab : [107, 142, 35], 
  orange : [255, 165, 0], 
  orangered : [255, 69, 0], 
  orchid : [218, 112, 214], 
  palegoldenrod : [238, 232, 170], 
  palegreen : [152, 251, 152], 
  paleturquoise : [175, 238, 238], 
  palevioletred : [219, 112, 147], 
  papayawhip : [255, 239, 213], 
  peachpuff : [255, 218, 185], 
  peru : [205, 133, 63], 
  pink : [255, 192, 203], 
  plum : [221, 160, 221], 
  powderblue : [176, 224, 230], 
  purple : [128, 0, 128], 
  red : [255, 0, 0], 
  rosybrown : [188, 143, 143], 
  royalblue : [65, 105, 225], 
  saddlebrown : [139, 69, 19], 
  salmon : [250, 128, 114], 
  sandybrown : [244, 164, 96], 
  seagreen : [46, 139, 87], 
  seashell : [255, 245, 238], 
  sienna : [160, 82, 45], 
  silver : [192, 192, 192], 
  skyblue : [135, 206, 235], 
  slateblue : [106, 90, 205], 
  slategray : [112, 128, 144], 
  slategrey : [112, 128, 144], 
  snow : [255, 250, 250], 
  springgreen : [0, 255, 127], 
  steelblue : [70, 130, 180], 
  tan : [210, 180, 140], 
  teal : [0, 128, 128], 
  thistle : [216, 191, 216], 
  tomato : [255, 99, 71], 
  turquoise : [64, 224, 208], 
  violet : [238, 130, 238], 
  wheat : [245, 222, 179], 
  white : [255, 255, 255], 
  whitesmoke : [245, 245, 245], 
  yellow : [255, 255, 0], 
  yellowgreen : [154, 205, 50],
};

var propDefaults = [];
propDefaults['alignment-baseline'] = '0';
propDefaults['baseline-shift'] = 'baseline';
propDefaults['clip'] = 'auto';
propDefaults['clip-path'] = 'none';
propDefaults['clip-rule'] = 'nonzero';
propDefaults['color'] = 'depends on user agent';
propDefaults['color-interpolation'] = 'sRGB';
propDefaults['color-interpolation-filters'] = 'linearRGB';
propDefaults['color-profile'] = 'auto';
propDefaults['color-rendering'] = 'auto';
propDefaults['cursor'] = 'auto';
propDefaults['direction'] = 'ltr';
propDefaults['display'] = 'inline';
propDefaults['dominant-baseline'] = 'auto';
propDefaults['enable-background'] = 'accumulate';
propDefaults['fill'] = 'black';
propDefaults['fill-opacity'] = '1';
propDefaults['fill-rule'] = 'nonzero';
propDefaults['filter'] = 'none';
propDefaults['flood-color'] = 'black';
propDefaults['flood-opacity'] = '1';
propDefaults['font'] = 'see individual properties';
propDefaults['font-family'] = 'Arial';
propDefaults['font-size'] = 'medium';
propDefaults['font-size-adjust'] = 'none';
propDefaults['font-stretch'] = 'normal';
propDefaults['font-style'] = 'normal';
propDefaults['font-variant'] = 'normal';
propDefaults['font-weight'] = 'normal';
propDefaults['glyph-orientation-horizontal'] = '0';
propDefaults['glyph-orientation-vertical'] = 'auto';
propDefaults['image-rendering'] = 'auto';
propDefaults['kerning'] = 'auto';
propDefaults['letter-spacing'] = 'normal';
propDefaults['lighting-color'] = 'white';
propDefaults['marker-end'] = 'none';
propDefaults['marker-mid'] = 'none';
propDefaults['marker-start'] = 'none';
propDefaults['mask'] = 'none';
propDefaults['opacity'] = '1';
propDefaults['overflow'] = 'hidden';
propDefaults['pointer-events'] = 'visiblePainted';
propDefaults['shape-rendering'] = 'auto';
propDefaults['stop-color'] = 'black';
propDefaults['stop-opacity'] = '1';
propDefaults['stroke'] = 'none';
propDefaults['stroke-dasharray'] = 'none';
propDefaults['stroke-dashoffset'] = '0';
propDefaults['stroke-linecap'] = 'butt';
propDefaults['stroke-linejoin'] = 'miter';
propDefaults['stroke-miterlimit'] = '4';
propDefaults['stroke-opacity'] = '1';
propDefaults['stroke-width'] = '1';
propDefaults['text-anchor'] = 'start';
propDefaults['text-decoration'] = 'none';
propDefaults['text-rendering'] = 'auto';
propDefaults['unicode-bidi'] = 'normal';
propDefaults['visibility'] = 'visible';
propDefaults['word-spacing'] = 'normal';
propDefaults['writing-mode'] = 'lr-tb';


/**
 * removes the leading and trailing spaces chars from the string
 */
String.prototype.trim = function() { return this.replace(/^\s+|\s+$/g, ''); };

initSMIL();


/*
tests it fails :
02 additive accumulate
03 inheritance
06 path attribute (FF bug)
08 idem
09 calcMode discrete
11 calcMode paced
12 calcMode spline
14 discrete
15 paced
17 spline
20 href ?
21 href ?
24 multiple transforms !
30 uses
31 display and visibility
33 keypoints, keyTimes
34 points
36 target.transform ?? probablement facile
39 ???
40 except posMarkers !!!
41 target.transform again
44 points again
46 target.transform again
52 xlink:href defines the event listener too ??
60 ...




*/
