import type { Api } from './types';
import * as auth from './auth';
import { getDestinationPhoto } from './photos';
import * as trips from './trips';

export const realApi: Api = {
  health: trips.health,
  register: auth.register,
  login: auth.login,
  me: auth.me,
  logout: auth.logout,
  generateTrip: trips.generateTrip,
  listTrips: trips.listTrips,
  getTrip: trips.getTrip,
  chatTrip: trips.chatTrip,
  getDestinationPhoto,
};
