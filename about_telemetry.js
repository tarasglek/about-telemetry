const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

const PREF_ENABLED = "toolkit.telemetry.enabled";
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

function getHTMLTable(stats, isMainThread) {
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
  }

function do_search(name) {
  let ls = document.getElementsByClassName("histogram");
  let ret = ""
  let re = new RegExp(name, "i");
  for each (let e in ls) {
    let id = e.id;
    if (typeof id != 'string')
      continue;
 
    if (!re.exec(id)) {
      e.style.display = "none";
      continue;
    }
    e.style.display = "block";
  }
}

function incremental_search() {
  clearTimeout(this._searchTimeout);
  let input = this;
  this._searchTimeout = setTimeout(function() {do_search(input.value)}, 300);
}

function addHeader(parent) {
  var enabled = false;
  try {
    enabled = Services.prefs.getBoolPref(PREF_ENABLED);
  } catch (e) {
    // Prerequesite prefs aren't set
  }
  var msg = enabled ?
    "Telemetry is enabled"
    : "Please set "+PREF_ENABLED+" to true in <a href='about:config'>about:config</a>";
  parent.appendChild(document.createTextNode(msg));
  if (enabled) {
    
    parent.appendChild(document.createTextNode(" | "));
    let input = document.createElement("input");
    input.value = "search";
    parent.appendChild(input);
    input.setSelectionRange(0, input.value.length);
    input.focus()
    input.onkeydown = incremental_search;
  }
  parent.appendChild(document.createElement("hr"));
}

function generate() {
  var body = document.getElementsByTagName("body")[0];
  addHeader(body);
  let content = document.createElement("div");
  const Telemetry = Cc["@mozilla.org/base/telemetry;1"].getService(Ci.nsITelemetry)
  
  var h = Telemetry.histogramSnapshots;
  var s = Telemetry.slowSQL;
  if (s) {
    let div = document.createElement("div");
    let html = getHTMLTable(s.mainThread, true);
    html += getHTMLTable(s.otherThreads, false);
    div.innerHTML = html
    content.appendChild(div);
  }
 
  for (var key in h) {
    var v = h[key]
    var sample_count = v.counts.reduceRight(function (a,b)  a+b)
    
    var buckets = v.histogram_type == Telemetry.HISTOGRAM_BOOLEAN ? [0,1] : v.ranges;
    var average =  v.sum / sample_count
    let div = document.createElement('div');
    div.className = "histogram";
    div.id = key;
    let divTitle = document.createElement("div");
    divTitle.appendChild(document.createTextNode(key));
    divTitle.className = "title";
    div.appendChild(divTitle);
    let html = '<div>'
    html += sample_count + " samples"
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
   
    div.innerHTML += html;
    content.appendChild(div);
  }
  body.appendChild(content);
}

onload=generate
