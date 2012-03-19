const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Telemetry = Cc["@mozilla.org/base/telemetry;1"].getService(Ci.nsITelemetry)

Cu.import("resource://gre/modules/Services.jsm");

const PREF_ENABLED = "toolkit.telemetry.enabled";
const DEBUG_SLOW_SQL = "toolkit.telemetry.debugSlowSql";
const HEIGHT = 18

function graph(parent, values, max_value, name, is_old_checker) {
  for each ([label, value] in values) {
    var belowEm = Math.round(HEIGHT * (value / max_value)*10)/10
    var aboveEm = HEIGHT - belowEm
    var bar = document.createElement("div");
    bar.className = "bar";
    // TODO: I can't set the style for createElement()ed elements :(
    var html = '<div class="above" style="height: ' + aboveEm + 'em;"></div>'
    html += value ? value : "&nbsp;"
    
    let old_or_new = "old"
    if (is_old_checker && !is_old_checker(name, label, value))
      old_or_new = "new"
    html += '<div class="'+old_or_new+'" style="height: ' + belowEm + 'em;"></div>'
    html += label
    bar.innerHTML = html;
    parent.appendChild(bar);
  }
}

function getHTMLTable(stats, isMainThread) {
    if (Object.keys(stats).length == 0) {
      return "";
    }
    var listHtml = '\n<table class=\"slowSql\" id="' + (isMainThread ? 'main' : 'other') + 'SqlTable">';
    listHtml += '\n<caption class=\"slowSql\">Slow SQL Statements on ';
    listHtml += (isMainThread ? 'Main' : 'Other') + ' Thread</caption>';
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
  window._searched = name;
}

function incremental_search() {
  clearTimeout(this._searchTimeout);
  let input = this;
  this._searchTimeout = setTimeout(function() {
                                     if (input._lastValue == input.value)
                                       return;
                                     input._lastValue = input.value;
                                     do_search(input.value)
                                   }, 300);
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
    let search = document.createElement("input");
    search.value = "search";
    parent.appendChild(search);
    search.setSelectionRange(0, search.value.length);
    search.focus()
    search.onkeydown = incremental_search;
    search._lastValue = search.value;
    
    parent.appendChild(document.createTextNode(" | "));
    let diff_button = document.createElement("button");
    diff_button.appendChild(document.createTextNode("Diff"));
    diff_button.onclick = diff;
    parent.appendChild(diff_button);
  }
  parent.appendChild(document.createElement("hr"));
}

function unpackHistogram(v/*histogram*/) {
  var sample_count = v.counts.reduceRight(function (a,b)  a+b)
  
  var buckets = v.histogram_type == Telemetry.HISTOGRAM_BOOLEAN ? [0,1] : v.ranges;
  var average =  Math.round(v.sum * 10 / sample_count) / 10
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
  return {values: values, pretty_average:average, max: max_value, sample_count:sample_count, sum:v.sum}
}

function diff() {
  let old = window._lastSnapshots;
  let h = Telemetry.histogramSnapshots;
  window._lastSnapshots = h;
  function is_old(name, old_label, old_value) {
    if (!name in old)
      return false;
    let old_hgram = unpackHistogram(old[name]);
    // return true
    // WTF code below causing weird histogram ordering
    for each (let [label, value] in old_hgram.values) {
      if (label == old_label && value == old_value) {
        return true;
      }
    }
    return false;
  }

  let e = document.getElementById("histograms");
  e.parentNode.removeChild(e);
  //alert('Red indicates that a bucket has changed')
  e = generate(h, Telemetry.slowSQL, Telemetry.debugSlowSql, is_old);
  document.getElementsByTagName("body")[0].appendChild(e);
  // restore the search query
  if (window._searched)
    do_search(window._searched);
}

function generate(histogramSnapshots, slowSql, fullSlowSql, is_old_checker) {
  let content = document.createElement("div");
  content.id = "histograms";
  if (slowSql) {
    let html = "";
    let sql = slowSql;

    let showFullSlowSql = false;
    if (fullSlowSql) {
      try {
        showFullSlowSql = Services.prefs.getBoolPref(DEBUG_SLOW_SQL);
      } catch (e) {
        // Pre-requesite pref isn't set
      }
    }

    if (showFullSlowSql) {
      sql = fullSlowSql;
      if (Object.keys(fullSlowSql.mainThread).length > 0 ||
          Object.keys(fullSlowSql.otherThreads).length > 0) {
        html += "<B>NOTE:</B> Slow SQL debugging is enabled. ";
        html += "Full SQL strings may be displayed below but they will not be submitted to Telemetry."
        html += "<BR>\n<BR>\n";
      }
    }

    html += getHTMLTable(sql.mainThread, true);
    html += getHTMLTable(sql.otherThreads, false);
    let div = document.createElement("div");
    div.innerHTML = html;
    content.appendChild(div);
  }

  for (var name in histogramSnapshots) {
    var hgram = unpackHistogram(histogramSnapshots[name]);
    let div = document.createElement('div');
    div.className = "histogram";
    div.id = name;
    let divTitle = document.createElement("div");
    divTitle.appendChild(document.createTextNode(name));
    divTitle.className = "title";
    div.appendChild(divTitle);
    let divStats = document.createElement("div");
    let stats = hgram.sample_count + " samples"
      + ", average = " + hgram.pretty_average
      + ", sum = " + hgram.sum;
    divStats.appendChild(document.createTextNode(stats))
    div.appendChild(divStats);
    graph(div, hgram.values, hgram.max, name, is_old_checker)
    content.appendChild(div);
  }
  return content;
}

function load() {
  var body = document.getElementsByTagName("body")[0];
  addHeader(body);
  window._lastSnapshots = Telemetry.histogramSnapshots;
  let content = generate(this._lastSnapshots, Telemetry.slowSQL, Telemetry.debugSlowSQL);
  body.appendChild(content);
}

onload=load
