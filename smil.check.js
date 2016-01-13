/**
 * Copyright 2012 Helder Magalhaes
 * MIT and GPLv3 Licenses
 *
 * Determine if SMIL is supported in order to inject the FakeSmile script only when necessary.
 * Measured average execution time (in IE9 and Fx12) was only a few milliseconds.
 *
 * Usage: place the script next to "smil.user.js" and insert it *last* into the document.
 *
 * Sample usage in an SVG document:
 * <svg>
 *   <elements ...>
 *   <script type="text/ecmascript" xlink:href="path/to/smil.check.js" />
 * </svg>
 *
 * Sample usage in an (X)HTML document:
 * <html>
 *   <elements ...>
 *   <script type="text/javascript" src="path/to/smil.check.js"></script>
 * </html>
 */

// wrap everything in a function call in order to avoid variable scoping issues and also to allow cleanup when done
(function(){

// for profiling only - uncomment this and the latest few lines when curious
//var start = (new Date()).getTime();

var svgns = "http://www.w3.org/2000/svg";

try{

	if(!document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#Animation", "1.1")){
		// even when the implementation doesn't claim to fully support SMIL animation, it may support parts of it
		// (for example, Gecko has been adding SMIL features since version 2 (Firefox 4), so we should test each feature separately)
		// Firefox still fails (as of version 15a1) and apparently will keep failing to implement animateColor
		// (https://bugzilla.mozilla.org/show_bug.cgi?id=436296)
		// therefore we need to find a reliable way of detecting support - Modernizr seems to have found a nice way of doing it
		// https://github.com/Modernizr/Modernizr/issues/35
		// https://github.com/Modernizr/Modernizr/blob/master/modernizr.js#L731

		// NOTE: evaluation order is important as it impacts performance
		// (so we should follow statistics to find out the best order for this list - currently it's based on my own experience)
		var smilTags = ["animate", "animateTransform", "animateMotion", "animateColor", "set"];
		var currTag, objName;
		for(var i = 0; i < smilTags.length; ++i){
			currTag = smilTags[i];
			// DOM element name is a camel-case version of the tag name
			// (SVGAnimateElement, SVGSetElement, etc.)
			objName = currTag.charAt(0).toUpperCase();
			objName += currTag.substring(1, currTag.length);

			// THINK: which approach is faster? will it worth to reverse this logic? profile!
			// (document.createElementNS + string search vs. using document.getElementsByTagNameNS directly)
			// NOTE: forcing cast to string is needed for compatibility with ASV
			if(("" + document.createElementNS(svgns, currTag)).indexOf(objName, 11) !== 11){ // NOTE: 11 = "[object SVG".length
				// user agent doesn't support this feature
				// throw "FakeSmile potentially required due to lack of support for: " + currTag;

				// deeper validation and further optimization: check if the document actually contains any tags of the unsupported type
				// NOTE: this can only be performed when the script is inserted *last* into the document
				if(document.getElementsByTagNameNS(svgns, currTag).length){
					// at least one element needs support from FakeSmile
					throw "FakeSmile required due to: " + currTag;
				}
			}
		}
	}

	var timesheetns = "http://www.w3.org/2007/07/SMIL30/Timesheets";
	var smil3ns = "http://www.w3.org/ns/SMIL30";

	if(!document.implementation.hasFeature(timesheetns, "1.0")){
		// test things which are not namespace-aware first due to support for HTML

		// "In non-XML markup languages, the link element can be used to reference an external timesheet document"
		// http://www.w3.org/TR/timesheets/#smilTimesheetsNS-Elements-Timesheet
		var linkElems = document.getElementsByTagName("link");
		var linkEle;
		for(var i = 0; i < linkElems.length; ++i){
			linkEle = linkElems.item(i);
			// perform similar check to one made in smil.user
			if((linkEle.getAttribute("rel") === "timesheet") && (linkEle.getAttribute("type") === "application/smil+xml")){
				throw "FakeSmile required due to: link";
			}
		}

		// THINK: can we use an approach similar to the one used for SMIL in SVG above?
		// (creating an element and checking if the implementation supports it)

		// check if the document actually contains any tags of the unsupported type
		if(document.getElementsByTagNameNS(smil3ns, "timesheet").length || document.getElementsByTagNameNS(timesheetns, "timesheet").length){
			// at least one element needs support from FakeSmile
			throw "FakeSmile required due to: timesheet";
		}

	}
	
	//check from Modernizr. Added because this was not working properly in IE11
	var supported = !!document.createElementNS &&
		/SVGAnimate/.test((({}).toString).call(document.createElementNS('http://www.w3.org/2000/svg', 'animate')));

	if(!supported) {
		throw "FakeSmile required due to: animate";
	}
}catch(exp){

	// debug only - uncomment these lines to know which particular element and/or cause is triggering FakeSmile to load
	/*
	// NOTE: in IE, console object is only available when Developer tools are open
	if(window.console && console.log){
		console.log(exp);
	}else{
		alert(exp);
	}
	*/

	var xlinkns = "http://www.w3.org/1999/xlink";
	// flag which tells if we should use xlink:href or src for script target
	var useHref = true;

	// get the relative path to the FakeSmile script, assuming it's located next to this one
	// NOTE: algorithm is based in the fact that this script is *not* inlined in the page, and, when loaded, it's the last one available
	// http://feather.elektrum.org/book/src.html
	var scriptList = document.getElementsByTagName("script");
	var currScript = scriptList.item(scriptList.length - 1);
	var scriptPath = currScript.getAttributeNS(xlinkns, "href");
	if(!scriptPath || !scriptPath.length){
		// fallback for HTML
		scriptPath = currScript.getAttribute("src");
		useHref = false;
	}
	var slashPos = scriptPath.lastIndexOf("/");
	if(slashPos != -1){
		var relPath = scriptPath.substring(0, slashPos + 1);
	}else{
		var relPath = "";
	}

	// required SMIL functionality (at least partially) not supported, so let's inject the FakeSmile script
	// (for safe, we also behave the same when something goes wrong)
	if(useHref){
		var scriptEle = document.createElementNS(svgns, "script");
		scriptEle.setAttributeNS(xlinkns, "xlink:href", relPath + "smil.user.js");
	}else{
		var scriptEle = document.createElement("script");
		scriptEle.setAttribute("src", relPath + "smil.user.js");
	}
	scriptEle.setAttribute("type", currScript.getAttribute("type"));
	document.documentElement.appendChild(scriptEle);

	// THINK: consider replacing this script's xlink:href instead
	// [+] will probably be better in terms of performance
	// [+] better in terms of DOM impact: number of script - and, generally, document - elements won't change
	// [-] possibly worse for debugging - once the script is replaced, smil.check.js code may not be available
	// [-] apparently this approach doesn't work, at least in IE9!
	//currScript.setAttributeNS(xlinkns, "xlink:href", scriptPath.replace("smil.check.js", "smil.user.js"));
}

// for profiling only - uncomment these and the "var start" line above when curious
/*
var loadTime = "Took " + ((new Date()).getTime() - start) + "ms to perform SMIL check";
// NOTE: in IE, console object is only available when Developer tools are open
if(window.console && console.log){
	console.log(loadTime);
}else{
	alert(loadTime);
}
*/

})();
