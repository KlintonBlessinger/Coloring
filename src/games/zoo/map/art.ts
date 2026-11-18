import aquarium from '../assets/aquarium.jpg';
import arctic from '../assets/arctic.jpg';
import birds from '../assets/birds.jpg';
import desert from '../assets/desert.jpg';
import keeper from '../assets/keeper.png';
import pathTile from '../assets/path.png';
import rainforest from '../assets/rainforest.jpg';
import reptileHouse from '../assets/reptile-house.jpg';
import savannah from '../assets/savannah.jpg';
import keeperMeta from '../keeper-meta.json' with { type: 'json' };

export const HABITAT_ART = {
  savannah,
  rainforest,
  desert,
  'reptile-house': reptileHouse,
  aquarium,
  arctic,
  birds,
} as const;

export const KEEPER_URL = keeper;
export const PATH_URL = pathTile;
export const KEEPER_META = keeperMeta;
