const util = require('util')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const sleep = require('util').promisify(setTimeout)

const LIVENESS_THRESHOLD = 33.33
const SAFETY_THRESHOLD = 66.66

// set to either liveness or safety threshold
const THRESHOLD = LIVENESS_THRESHOLD

// For more information on the faults that can occur on Tendermint,
// please see this excellent write-up:
// https://blog.cosmos.network/the-4-classes-of-faults-on-mainnet-bfabfbd2726c

/**
 * Recursive function that iterates of a collection of zones,
 * fetches the data of the respective zone from cosmostation,
 * and populates the main data object, listOfZones.
 * 
 * @param {Array} zones Collection of zone objects, each a tuple of id, name.
 * @returns Recurses until it returns the finalized listOfZones object.
 */
async function getZoneInfo(zones, listOfZones) {
  const zone = zones.pop()

  console.log('retrieving data for', zone.name)

  const baseurl = `https://api-${zone.id}.cosmostation.io/v1/`

  let url = baseurl.concat('status')

  let res = {}

  try {
    res = await axios.get(url)
  } catch (e) {
    console.error(e.code, url)

    return zones.length === 0 ? listOfZones : getZoneInfo(zones, listOfZones)
  }

  const zonedata = {
    zone,
    total_validator_num: res.data.total_validator_num,
    bonded_tokens: BigInt(res.data.bonded_tokens),
    not_bonded_tokens: BigInt(res.data.not_bonded_tokens),
  }

  url = baseurl.concat('staking/validators')

  try {
    res = await axios.get(url)
  } catch (e) {
    console.error(e.code, url)

    listOfZones.push(zonedata)

    return zones.length === 0 ? listOfZones : getZoneInfo(zones, listOfZones)
  }

  zonedata.validators = res.data.map((d) => ({
    moniker: d.moniker,
    tokens: BigInt(d.tokens),
  }))

  listOfZones.push(zonedata)

  await sleep(1000)

  return zones.length === 0 ? listOfZones : getZoneInfo(zones, listOfZones)
}

/**
 * Iterates over the raw zones data and extrapolates a data required
 * for calculating the security threshold of each zone.
 * 
 * @param {Object} zonesdata The complete cached data of all zones.
 * @returns A collection of zone security info objects.
 */
function parseZonesData(zonesdata) {
  // used for debugging, for tracking any loss of precision
  let shares = []

  const calculateShare = (total, individual) => {
    const share = (individual / total) * 100

    shares.push(share)

    return share
  }

  let results = zonesdata.map((z) => {
    // display sum of shares calculated from last round
    // for tracking any precision loss, sum of values must equal 100
    // console.log(shares.reduce((acc, cur) => acc + cur, 0))

    // reset shares for this round
    shares = []

    return {
      zone: z.zone,
      total_validator_num: z.total_validator_num,
      bonded_tokens: z.bonded_tokens,
      not_bonded_tokens: z.not_bonded_tokens,
      validators: z.validators.map((v) => {
        return {
          moniker: v.moniker,
          tokens: v.tokens,
          percentage_share: calculateShare(z.bonded_tokens, v.tokens),
        }
      }),
    }
  })

  return results
}

/**
 * Iterates over the collection of zone security objects,
 * and extrapoltes the security threshold for each zone.
 * 
 * @param {Object} zones The collection of zone security objects.
 */
function parseZonesDataCache(zones) {
  console.log(
    '\nPreviously generated data file detected, using data file instead of fetching data . . .\n'
  )

  const results = parseZonesData(zones)

  const stats = []

  const csv = ['Zone,Staker,Share']

  results.forEach((r) => {
    // remember to perform sorting here
    let cumulativeStakingPower = 0

    let i = 0

    let collusionQuorom = []

    while (cumulativeStakingPower < THRESHOLD && i < r.validators.length) {
      const share = r.validators[i].percentage_share

      if (share < 0.01) {
        i++

        continue
      }

      cumulativeStakingPower += share

      collusionQuorom.push({
        staker: r.validators[i].moniker,
        share: r.validators[i].percentage_share.toFixed(3).slice(0, -1),
      })

      i++
    }

    stats.push({ zone: r.zone, threshold: i })

    console.log('')
    console.log('\nNumber of validators required to compromise ' + r.zone.name + ':', i, '\n')

    collusionQuorom.forEach((q) => {
      console.log(` - ${q.staker.trim().padEnd(33, '.')} ${q.share.padStart(5)} %`)
      csv.push(`${r.zone.name},${q.staker.trim().replaceAll(',', ';')},${q.share}`)
    })
  })

  console.log('\n\n\n Number of validators that could compromise security:\n')

  stats.sort((a, b) => a.threshold - b.threshold)

  stats.forEach((stat) => {
    console.log(
      ` ${stat.zone.name.concat(':').padEnd(18)} ${stat.threshold.toString().padStart(2)}`
    )
  })

  const csvfile = path.join(__dirname, 'zones-security-thresholds.csv')

  fs.writeFileSync(csvfile , csv.join('\r\n'))

  console.log('')
}

/**
 * Writes the cache of data retrieved from the cosmostation API to the local filesystem.
 * 
 * @param {Array} data The collection of raw data for each zone.
 */
function cacheZonesData(data) {
  // console.log(util.inspect(data, true, 6, true))

  try {
    // gets around "TypeError: Do not know how to serialize a BigInt"
    BigInt.prototype.toJSON = function () {
      return this.toString()
    }

    fs.writeFileSync(datafile, JSON.stringify(data, null, 2))

    console.log('\nZones data data is saved locally.\n')
  } catch (err) {
    console.error(err)
  }
}

console.log('\nCollecting zones data . . .\n')

const zoneslist = require('./zones.json')
const datafile = path.join(__dirname, 'zonesdata.json')

if (fs.existsSync(datafile)) {
  const zones = require(datafile)

  parseZonesDataCache(zones, zoneslist)
} else {
  getZoneInfo(zoneslist, []).then(cacheZonesData)
}
