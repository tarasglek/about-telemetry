Components.utils.import("resource://gre/modules/Services.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cm = Components.manager;

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const MY_URL = "resource://telemetry-addon/";

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

function AboutHistograms() {}

AboutHistograms.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
  classDescription: "about:telemetry",
  classID: Components.ID("{1b44f837-58e7-4f54-8542-413d13b6d61e}"),
  contractID: "@mozilla.org/network/protocol/about;1?what=telemetry",
  
  newChannel: function(uri)
  {
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var html = 'data:text/html,<html><head>' 
               + '<LINK href="' + MY_URL + 'stylesheet.css" rel="stylesheet" type="text/css">'
               + '<script type="application/javascript;version=1.8" src="' + MY_URL + 'about_telemetry.js"></script>'
               + '</head><body>';
    html += "</body></html>";

    var channel = ioService.newChannel(html, null, null);
    var securityManager = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager);
    var principal = securityManager.getSystemPrincipal(uri);
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
