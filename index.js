import * as sources from './sources';

//
// Usage
// bot <sourceId> [date_from]
//

if (process.argv.length <= 2) {
  console.log('You must specify a source.');
  process.exit(1);
}

const params = process.argv;
params.splice(0, 2);

const [
  sourceId,
  dateFrom = null
] = params;

if (sources.hasOwnProperty(sourceId) === false) {
  console.log(`Unknown source '${sourceId}'`);
  process.exit(2);
}

const source = sources[sourceId];

// run the bot
source(dateFrom);
