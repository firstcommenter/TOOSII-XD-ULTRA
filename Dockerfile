FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all files
COPY . .

# Create necessary directories
RUN mkdir -p tmp session database

# Expose port (if needed for web interface)
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
