ping.telemetry.xpi: bootstrap.js install.rdf stylesheet.css about_telemetry.js
	zip -9 $@ $+
clean:
	rm -f ping.telemetry.xpi *[~#]
