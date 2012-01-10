Components.utils.import("resource://gre/modules/Services.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cm = Components.manager;
const PREF_ENABLED = "toolkit.telemetry.enabled";

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const MY_URL = "resource://telemetry-addon/";

function log(msg) {
  dump(msg+"\n");
  var c=  Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
  c.logStringMessage(msg);
}

/**
 * Get the app's name so we can properly dispatch app-specific
 * methods per API call
 * @returns Gecko application name
 */
function appName()
{
  let APP_ID = Services.appinfo.QueryInterface(Ci.nsIXULRuntime).ID;

  let APP_ID_TABLE = {
    "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}": "FIREFOX" ,
    "{3550f703-e582-4d05-9a08-453d09bdfdc6}": "THUNDERBIRD",
    "{a23983c0-fd0e-11dc-95ff-0800200c9a66}": "FENNEC" ,
    "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}": "SEAMONKEY",
  };

  let name = APP_ID_TABLE[APP_ID];

  if (name) {
    return name;
  }
  throw new Error("appName: UNSUPPORTED APPLICATION UUID");
}


Cm.QueryInterface(Ci.nsIComponentRegistrar);

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const HEIGHT = 18
function graph(values, max_value) {
  var html = ""
  for each ([label, value] in values) {
    var below = Math.round(HEIGHT * (value / max_value)*10)/10
    var above = HEIGHT - below
    html += '<div class="bar">'
    html += '<div class="above" style="height: ' + above + 'em;"></div>'
    html += value ? value : "&nbsp;"
    
    html += '<div class="below" style="height: ' + below + 'em;"></div>'
    html += label
    html += '</div>'
  }
  return html
}
function AboutHistograms() {}

AboutHistograms.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
  classDescription: "about:telemetry",
  classID: Components.ID("{1b44f837-58e7-4f54-8542-413d13b6d61e}"),
  contractID: "@mozilla.org/network/protocol/about;1?what=telemetry",

  getHTMLTable: function(stats, isMainThread) {
    if (Object.keys(stats).length == 0) {
      return "";
    }
    var listHtml = '\n<table class=slowSql id="' + (isMainThread ? 'main' : 'other') + 'SqlTable">';
    listHtml += '\n<caption>Slow SQL Statements on ' + (isMainThread ? 'Main' : 'Other') + ' Thread</caption>';
    listHtml += '\n<tr><th>Hits</th><th>Avg. Time (ms)</th><th>Statement</th></tr>';
    for (var key in stats) {
      var hitCount = stats[key][0];
      var averageTime = stats[key][1]/hitCount;
      listHtml += '\n<tr>';
      listHtml += '<td>' + hitCount + '</td>';
      listHtml += '<td>' + averageTime.toFixed(0) + '</td>';
      listHtml += '<td>' + key + '</td>';
      listHtml += '</tr>';
    }
    listHtml += '\n</table>';
    listHtml += "\n<hr>\n"
    return listHtml;
  },

  newChannel: function(uri)
  {
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var html = 'data:text/html,<html><head>' 
               + '<LINK href="' + MY_URL + 'stylesheet.css" rel="stylesheet" type="text/css">'
               + '</head><body>';
    var enabled = false;
    try {
      enabled = Services.prefs.getBoolPref(PREF_ENABLED);
    } catch (e) {
      // Prerequesite prefs aren't set
    }

    if (enabled) {
      html += "Telemetry is enabled";
    } else {
      html += "Please set "+PREF_ENABLED+" to true in <a href='about:config'>about:config</a>"
    }
    //html += '<script src="' + MY_URL + 'brains.js">'
//    html += '<br><form><input type="text" style="width:50%" value="filter" onchange="doSearch()"></form>'
    html += "\n<hr>\n"
    const Telemetry = Cc["@mozilla.org/base/telemetry;1"].getService(Ci.nsITelemetry)

    var h = Telemetry.histogramSnapshots;
    var s = Telemetry.slowSQL;
    if (s) {
      html += this.getHTMLTable(s.mainThread, true);
      html += this.getHTMLTable(s.otherThreads, false);
    }

    for (var key in h) {
      var v = h[key]
      var sample_count = v.counts.reduceRight(function (a,b)  a+b)
     
      var buckets = v.histogram_type == Telemetry.HISTOGRAM_BOOLEAN ? [0,1] : v.ranges;
      var average =  v.sum / sample_count
      html += '<div class=main id="'+key+'"><div>'
      html += key+"<br>" + sample_count + " samples"
      html += ", average = " + Math.round(average*10)/10
      html += ", sum = " + v.sum
      html += "</div>"
      var max_value = Math.max.apply(Math, v.counts)
      var first = true
      var last = 0;
      var values = []
      for (var i = 0;i<buckets.length;i++) {
        var count = v.counts[i]
        if (!count)
          continue
        if (first) {
          first = true;
          first = false;
          if (i) {
            values.push([buckets[i-1], 0])
          }
        }
        last = i + 1
        values.push([buckets[i], count])
      }
      if (last && last < buckets.length) {
        values.push([buckets[last],0])
      }
      html += graph(values, max_value)
      html +="</div>\n"
    }
    html += "</body></html>";

    var channel = ioService.newChannel(html, null, null);
    var securityManager = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager);
    var principal = securityManager.getCodebasePrincipal(uri);
    channel.originalURI = uri;
    channel.owner = principal;
    return channel;
  },

  getURIFlags: function(uri)
  {
    return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT;
  }
}

const AboutHistogramsFactory = XPCOMUtils.generateNSGetFactory([AboutHistograms])(AboutHistograms.prototype.classID);

var global = this;

function monkeyPatchWindow(w, loadedAlready) {
  let doIt = function () {
    let taskPopup = w.document.getElementById("taskPopup");

    // Check it's a mail:3pane
    if (!taskPopup)
      return;

    let menuitem = w.document.createElement("menuitem");
    menuitem.addEventListener("command", function () {
      w.document.getElementById("tabmail").openTab(
        "contentTab",
        { contentPage: "about:telemetry" }
      );
    }, false);
    menuitem.setAttribute("label", "about:telemetry");
    menuitem.setAttribute("id", "aboutTelemetryMenuitem");
    taskPopup.appendChild(menuitem);
  };
  if (loadedAlready)
    doIt();
  else
    w.addEventListener("load", doIt, false);
}

function unMonkeyPatchWindow(w) {
  let menuitem = w.document.getElementById("aboutTelemetryMenuitem");
  menuitem.parentNode.removeChild(menuitem);
}

//text-overflow:  ellipsis

function startup(aData, aReason) {
  let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  let alias = Services.io.newFileURI(aData.installPath);
  if (!aData.installPath.isDirectory())
    alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
  resource.setSubstitution("telemetry-addon", alias);

  // For Thunderbird, since there's no URL bar, we add a menu item to make it
  // more discoverable.
  if (appName() == "THUNDERBIRD") {
    // Thunderbird-specific JSM
    Cu.import("resource:///modules/iteratorUtils.jsm", global);

    // Patch all existing windows
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane"), Ci.nsIDOMWindow)) {
      // True means the window's been loaded already, so add the menu item right
      // away (the default is: wait for the "load" event).
      monkeyPatchWindow(w.window, true);
    }

    // Patch all future windows
    Services.ww.registerNotification({
      observe: function (aSubject, aTopic, aData) {
        if (aTopic == "domwindowopened") {
          aSubject.QueryInterface(Ci.nsIDOMWindow);
          monkeyPatchWindow(aSubject.window);
        }
      },
    });
  }

  // This throws when doing disable/enable, so leave it at the end...
  Cm.registerFactory(AboutHistograms.prototype.classID,
                     AboutHistograms.prototype.classDescription,
                     AboutHistograms.prototype.contractID,
                     AboutHistogramsFactory);
}

function shutdown(aData, aReason) {
  if (aReason == APP_SHUTDOWN) return;

  let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  resource.setSubstitution("telemetry-addon", null);

  if (appName() == "THUNDERBIRD") {
    // Un-patch all existing windows
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane")))
      unMonkeyPatchWindow(w);
  }

  Cm.unregisterFactory(AboutHistograms.prototype.classID,
                       AboutHistogramsFactory);
}
function install(aData, aReason) { }
function uninstall(aData, aReason) { }
