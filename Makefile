ping.telemetry.xpi: bootstrap.js install.rdf stylesheet.css
	zip -9 $@ $+
clean:
	rm -f ping.telemetry.xpi *[~#]
