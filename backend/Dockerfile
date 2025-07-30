FROM node:18

# Install build dependencies for node-hid
RUN apt-get update && apt-get install -y \
  build-essential \
  python3 \
  libusb-1.0-0-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
