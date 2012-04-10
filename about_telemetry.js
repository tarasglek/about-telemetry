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


function stop_animate_click() {
  while (this.hasChildNodes()) {
    this.removeChild(this.lastChild);
  }
  this.appendChild(document.createTextNode("Animate"))
  this.onclick = animate_click;
  let anidiv = document.getElementById("anidiv");
  let stats = document.getElementById("targetdiv").stats;
  while (anidiv.hasChildNodes()) {
    anidiv.removeChild(anidiv.lastChild);
  }
  stats.janks.sort(function ([a, _], [b, __]) b - a)
  for each (let [ms, jank] in stats.janks) {
    let d = document.createElement("div");
    d.appendChild(document.createTextNode(ms + " " + uneval(jank)))
    anidiv.appendChild(d)
  }
  let summary = 
    "min: " + stats.min + "ms"
    + "\nmax: " + stats.max + "ms"
    + "\navg: " + Math.round(stats.sum * 100 / stats.count) / 100 + "ms"
    + "\n" + stats.janks.length + "/" + stats.count
    + " (" + Math.round(stats.janks.length * 10000 / stats.count) / 100 + "%) animation steps were late"
  let presummary = document.createElement("PRE");
  presummary.appendChild(document.createTextNode(summary))
  anidiv.appendChild(presummary);
}


/**
 * @return {"histogram_name":[[changedColumnIndexA,difference], [changedColumnIndexB, difference], ...], ...}
 */
function diff(oldHash, recentHash) {
  let ret = {};
  for (var name in recentHash) {
    let recent = recentHash[name];
    let old = oldHash[name];
    if (!old) {
      let changes = [];
      for (let i = 0;i<recent.counts.length;i++) {
        let v = recent.counts[i];
        if (v)
          changes.push([i, v])
      }
      ret[name] = changes;
      continue;
    }
    let changed_columns = [];
    for (let i = 0;i < old.counts.length;i++) {
      let diff = recent.counts[i] - old.counts[i];
      if (diff)
        changed_columns.push([i, diff]);
    }
    if (changed_columns.length) {
      ret[name] = changed_columns;
    }
  }
  return ret;
}

let useless_telemetry_re = /WORD_CACHE|HTML_FOREGROUND_REFLOW_MS/

function animation_loop(now){
  let targetdiv = document.getElementById("targetdiv");
  if (!targetdiv) {
    return;
  }
  var deltaMS = now - targetdiv.start;
  targetdiv.style.left = 90 - Math.abs(deltaMS/50 % 180 - 90) + "%";
  let stats = targetdiv.stats
  let newgrams = Telemetry.histogramSnapshots;
  for (let h in newgrams) {
    if (useless_telemetry_re.test(h))
      delete newgrams[h]
  }

  if (stats.last) {
    let diff = now - stats.last
    if (!stats.min)
      stats.min = diff
    else
      stats.min = Math.min(stats.min, diff)

    if (!stats.max)
      stats.max = diff
    else
      stats.max = Math.max(stats.max, diff)

    stats.sum += diff
    stats.count++;
    if (diff > 17) {
      let hgramdiff = window.diff(stats.oldgrams, newgrams);
      if (Object.keys(hgramdiff).length)
        stats.janks.push([diff, hgramdiff])
    }
  }
  stats.oldgrams = newgrams
  stats.last = now;
  mozRequestAnimationFrame(animation_loop);
}

function animate_click() {
  while (this.hasChildNodes()) {
    this.removeChild(this.lastChild);
  }
  this.appendChild(document.createTextNode("Stop Animation"))
  this.onclick = stop_animate_click;
  let anidiv = document.getElementById("anidiv");
  while (anidiv.hasChildNodes()) {
    anidiv.removeChild(anidiv.lastChild);
  }

  let targetdiv = document.createElement("span");
  targetdiv.id = "targetdiv";
  targetdiv.appendChild(document.createTextNode("BUTTER"));
  anidiv.appendChild(targetdiv);
  targetdiv.style.position = "relative";
  targetdiv.style.left = "50%";
  targetdiv.start = window.mozAnimationStartTime;
  targetdiv.stats = {count:0, sum:0, janks:[]}
  animation_loop(targetdiv.start);
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
    diff_button.onclick = diff_click;
    parent.appendChild(diff_button);

    parent.appendChild(document.createTextNode(" | "));
    let animate_button = document.createElement("button");
    animate_button.appendChild(document.createTextNode("Animate"));
    animate_button.onclick = animate_click;
    parent.appendChild(animate_button);

    let anidiv = document.createElement("div");
    anidiv.id = "anidiv";
    parent.appendChild(anidiv);
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

function diff_click() {
  let old = window._lastSnapshots;
  let h = Telemetry.histogramSnapshots;
  // todo use diff() function below instead of unpackHistogram
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
  e = generate(h, Telemetry.slowSQL, Telemetry.debugSlowSQL, is_old);
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
