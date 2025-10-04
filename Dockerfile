FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app

# Copy backend source
COPY backend/pom.xml ./backend/
COPY backend/src ./backend/src/

# Build the application
WORKDIR /app/backend
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre

WORKDIR /app

# Copy the jar from build stage
COPY --from=build /app/backend/target/washsimple-backend-1.0.0.jar app.jar

# Expose port
EXPOSE 8080

# Run the application
CMD ["java", "-jar", "app.jar"]