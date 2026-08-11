export interface User {
  id: string;
  name: string;
  email: string;
  role: "creator" | "customer";
}

export interface PhotoEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  coverImageUrl?: string;
  totalPhotos: number;
  pricePerPhoto: number;
  creatorId: string;
  isPublic: boolean;
}

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}
