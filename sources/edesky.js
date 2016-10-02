import url from 'url';
import fetch from 'node-fetch';
import { Parser } from 'xml2js';
import dateformat from 'dateformat';
import colors from 'colors/safe';
import polygonCenter from 'geojson-polygon-center';
import geocluster from 'geocluster';
import { store } from '../firebase';

const downloadAndProcess = (dateFrom, page = 1) => {
  console.log('> processing page', page);
  const searchUrl = url.format({
    protocol: 'https:',
    hostname: 'edesky.cz',
    pathname: '/api/v1/documents',
    query: {
      keywords: 'územním rozhodnutím',
      created_from: dateFrom,
      search_with: 'es', // elastic search_with
      dashboard_id: 59, // 59 is Prague
      page
    }
  });

  console.log('> download data from edesky.cz', colors.underline(searchUrl));
  fetch(searchUrl)
    .catch(() => console.error(console.red('>> error during HTTP GET request ' + searchUrl)))
    .then(res => res.text())
    .then(xml => {
      console.log(colors.green('> XML downloaded, start processing'));
      return processPage(xml);
    })
    .catch(err => {
      console.error(console.red('>> cannot process the response from edesky.cz'))
      console.error(searchUrl, ' -> ', err);
      return Promise.resolve(true);
    })
    .then(isDone => {
      if (isDone === true) {
        console.log('> no more pages to download');
        return Promise.resolve();
      } else {
        console.log('> download one more page');
        return downloadAndProcess(dateFrom, page + 1);
      }
    });
};

const processPage = (xml) => {
  return new Promise((resolve, reject) => {
    const parser = new Parser();
    parser.parseString(xml, (err, data) => {
      if (err) {
        return reject();
      } else if (data.hash && Number(data.hash.status[0]) / 100 >= 4) {
        return reject('HTTP response ' + data.hash.status[0]);
      }

      console.log('> XML parsing OK');
      data = data.edesky_search_api;

      if (data.meta[0].documents_count[0]._ == 0) {
        console.log('> no documents to process');
        return resolve();
      }

      const docs = data.documents[0].document;
      console.log('> documents to process:', docs.length);

      Promise.all(docs.map(processDocument))
        .catch((err) => console.log(colors.red('>> cannot process all documents', err)))
        .then(() => {
          console.log('> finished processing', docs.length, 'documents');
          console.log(data.meta.page.$.total, data.meta.page);
          const isDone = data.meta.page.$.total === data.meta.page._;
          return resolve(isDone);
        });
    });
  });
};

const processDocument = (document) => {
  return new Promise((resolve, reject) => {
    var {
      edesky_id: documentId,
      name,
      edesky_url: edeskyUrl,
      dashboard_name: municipalityName
    } = document.$;
    console.log('> retreiving locations for', colors.yellow('edesky'), 'document', colors.yellow(documentId), 'from', colors.yellow('mapasamospravy.cz'));

    const tiles = [];
    const x = { min: 4420, max: 4430 };
    const y = { min: 2770, max: 2780 };

    for (let i = x.min; i <= x.max; ++i) {
      for (let j = y.min; j <= y.max; ++j) {
        tiles.push([ i, j ]);
      }
    }

    return processTile(documentId, [], tiles)
      .then((foundItems) => {
        console.log('> potential addresses for document', colors.yellow(documentId), ':', foundItems.length === 0 ? colors.red(0) : colors.green(foundItems.length));
        if (foundItems.length == 0) {
          console.log('> no locations found for document', colors.yellow(doucmentId), ':-(');
          resolve();
        } else {
          const best = calculateBestLocation(foundItems);
          if (best === null) {
            console.log('>> cannot determine the best location for document', colors.yellow(documentId));
            reject();
          }

          const [ lon, lat ] = best;
          console.log('> document', colors.yellow(documentId), 'was placed at', colors.yellow('lat: ' + lat + ', lon: ' + lon));
          return saveDocument(name, municipalityName, edeskyUrl, { lat, lon })
            .catch(erro => console.log(colors.red('>> cannot save the collected information for document'), colors.yellow(documentId)))
            .then(() => {
              console.log('>', colors.green('SAVED: '), colors.yellow(name), '-', colors.underline(edeskyUrl), '(', municipalityName, ')');
              return resolve();
            });
        }
      });
  });
};

const calculateBestLocation = (locations) => {
  const clusters = geocluster(locations, 50); // 50m bias
  const largestCluster = clusters.reduce(
    (largest, cluster) => largest === null || cluster.elements.length > largest.elements.length ? cluster : largest,
    null
  );
  return largestCluster ? largestCluster.centroid : null;
};

const saveDocument = (name, municipalityName, edeskyUrl, location) => {
  return store([ location.lon, location.lat ], { type: 'edesky', category: 'Realita', title: name, municipalityName, edeskyUrl });
};

const processTile = (documentId, foundItems, remainingTiles) => {
  // console.log(remainingTiles);
  const [ x, y ] = remainingTiles.pop();
  const mapasamospravyUrl = url.format({
    protocol: 'http:',
    hostname: 'mapasamospravy.cz',
    pathname: `/tiles/13/${x}/${y}.json`,
    query: { 'q[document_edesky_document_id_eq]': documentId }
  });

  console.log('> download data from mapasamospravy.cz', colors.underline(mapasamospravyUrl));
  return fetch(mapasamospravyUrl)
          .catch(err => console.error(colors.red('>> error during HTTP request ' + colors.underline(mapasamospravyUrl))))
          .then(res => res.json())
          .then(data => {
            if (!data.features) {
              throw new Error('mapasamospravy.cz did not return a GeoJSON');
            }

            const locations = data.features
                                .map(polygon => polygonCenter(polygon.geometry))
                                .map(point => point.coordinates);
            foundItems = [ ...locations, ...foundItems ];
            if (remainingTiles.length > 0) {
              return processTile(documentId, foundItems, remainingTiles);
            } else {
              return foundItems; // Yes!!! End of promise 'recursion'
            }
          });
};

const bot = (dateFrom) => {
  console.log(colors.bold('[EDESKY.cz bot]'));

  if (!dateFrom) {
    dateFrom = dateformat(new Date(), "yyyy-mm-dd");
  }

  downloadAndProcess(dateFrom);
};

export default bot;
