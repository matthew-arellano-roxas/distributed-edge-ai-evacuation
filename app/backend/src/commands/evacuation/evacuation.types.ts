export type BuildingCommand =
  | RouteRequestCommand
  | LocationAvailabilityCommand
  | PathAvailabilityCommand
  | ResetGraphCommand;

export type RouteRequestCommand = {
  type: 'route_request';
  from: string;
};

export type LocationAvailabilityCommand = {
  type: 'location_availability';
  location: string;
  available?: boolean;
};

export type PathAvailabilityCommand = {
  type: 'path_availability';
  from: string;
  to: string;
  available?: boolean;
};

export type ResetGraphCommand = {
  type: 'reset_graph';
};

export type BuildingRouteResponse =
  | BuildingRouteFoundResponse
  | BuildingRouteNotFoundResponse;

export type BuildingRouteFoundResponse = {
  from: string;
  found: true;
  distance: number;
  path: string[];
  target: string;
};

export type BuildingRouteNotFoundResponse = {
  from: string;
  found: false;
};
