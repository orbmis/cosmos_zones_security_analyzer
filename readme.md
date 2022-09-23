# Cosmos Zones Security Analyzer

This is a script uses the Mintscan / Cosmostation API to retrieve information about various Cosmos Zones and their respective validator set.

The script then attempts to deduce what the mininum number of validators on each zone that would be required in order to compromise the zone's security.

It does this by looking at the percentage of stake held by each validator in each zone, sorts by percentage stake, and counts the number that have eith either 1/3 of the stake.

In Tendermint, 1/3 of compromised validators can cause a liveness fault whereas 2/3 can cause a safety fault (i.e. a byantine fault).

You can toggle between liveness and safety thresholds at the top of the `index.js` file.

## Running the script

To run the script, simply change into the directory, and run:

`npm install` 

and then run: `node .`

By default this will print an analysis on screen that is based on cached data.  To grab up-to-date data, you'll have to remove the file: `zonesdata.json`, and then run `node `' again to retrieve refresh data.  This takes a few minutes, and when the process is complete, running `node .` subsequently will print the analysis on scree from locally cached data again.

The analysis also writes into the `zones-security-thresholds.csv` file so that you can import it into a spreadsheet and do spreadsheety things with the data.:w

## Disclaimer

This script is a quick hack to get a rough estimate of the security thresholds of various zones, it's not meant to be 100% accurate.  Please let me know if you see any errors or ommissions or otherwise generally think it can be improved.  (Also feel free to contribute by opening a PR).
