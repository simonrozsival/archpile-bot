import Firebase from 'firebase';
import GeoFire from 'geofire';
import colors from 'colors';

const config = {
  apiKey: "AIzaSyCXCTCNFNY5Dh_MhvAg1cDsMLyYLh1Jgec",
  authDomain: "archpile-1599c.firebaseapp.com",
  databaseURL: "https://archpile-1599c.firebaseio.com",
  storageBucket: "archpile-1599c.appspot.com",
  messagingSenderId: "170078753831"
};

try {
  Firebase.initializeApp(config);
} catch (err) {
  console.warn(colors.bold('Firebase error:'), err);
}

const ref = Firebase.database().ref();

export const store = (location, data) => {
  // findNearestNearPoint(location)
  // .then(point => {
      // if (!point) {
        const [ lon, lat ] = location;
        console.log('> adding new place to firebase...');
        try {
          var pointRef = ref.child('places').push({ coords: { lon, lat } });
        } catch (err) {
          console.log(colors.red('>> failed pushing to firebase'), err);
        }
        console.log('> added new place', colors.yellow(pointRef.key));
      // }

        return pointRef
          .catch(err => console.log(colors.red('>> cannot create new point')))
          .then(() => {
            const pileRef = ref.child(`piles/${pointRef.key}`).push(data);
            console.log('> added an item to the pile', colors.yellow(pointRef.key), 'with id', colors.yellow(pileRef.key));
            return pileRef.catch(err => console.log(colors.red('>> cannot add data to a pile')));
          });
  // });
};

const findNearestNearPoint = (center) => {
  const geoFire = new GeoFire(ref);
  return new Promise((resolve, reject) => {
    const query = geoFire.query({
      center,
      radius: 50 / 1000 // 50m (in km)
    });

    let nearest = null;
    query.on('key_entered', (key, loc, dist) => {
      if (nearest === null || nearest.dist > dist) {
        nearest = { key, loc, dist };
      }
    });

    query.on('ready', () => resolve(nearest));
  });
}
