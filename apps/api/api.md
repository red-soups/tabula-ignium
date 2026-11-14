# Tabula Ignium API

Java 21을 대상으로 빌드하는 Spring Boot 4.1.2 백엔드입니다. Spring MVC로 HTTP API를 만들고 Bean Validation으로 요청 값을 검증할 수 있습니다. Spring Data JPA와 MyBatis 4.1.0은 같은 PostgreSQL 연결 설정을 사용합니다.

## 빌드와 실행

JDK 21 이상이 필요합니다. 저장소 루트에서 아래 명령으로 DB 연결 없이 빌드할 수 있습니다.

```sh
cd apps/api
./mvnw verify
```

팀의 macOS 개발 환경에서는 `./mvnw`를 사용합니다. Wrapper는 첫 실행 시 Maven 3.10.0을 내려받습니다.

서버를 시작하려면 PostgreSQL과 Google OAuth 클라이언트 설정이 필요합니다. 기본 포트는 `8080`입니다. [Google 로그인 설정 및 실행 절차](docs/google-oauth.md)를 따라 시작할 수 있습니다.

## 파일 구성

| 항목 | 역할 |
| --- | --- |
| `pom.xml` | Java 대상 버전, Spring Boot, 라이브러리 의존성과 JAR 빌드 설정을 관리합니다. |
| `mvnw`, `.mvn/wrapper/maven-wrapper.properties` | macOS/Linux용 Maven 실행 스크립트와 사용할 Maven 버전 및 다운로드 주소입니다. |
| `src/main/java/com/tabulaignium/api/` | API 구현을 추가하는 Java 패키지입니다. `TabulaIgniumApiApplication.java`가 시작점이며 Spring이 이 패키지와 하위 패키지의 컴포넌트를 찾습니다. |
| `src/main/resources/` | 실행 설정과 SQL을 두는 폴더입니다. `application.yml`이 포함되어 있습니다. |
| `.gitignore`, `.gitattributes` | 빌드 결과와 로컬 환경 파일을 Git에서 제외하고, 실행 스크립트의 줄바꿈 형식을 지정합니다. |
| `target/` | Maven이 생성하는 폴더입니다. 컴파일된 클래스와 실행 가능한 JAR가 들어갑니다. |

## application.yml

| 설정 | 역할 |
| --- | --- |
| `spring.application.name` | 애플리케이션 이름을 `tabula-ignium-api`로 설정합니다. |
| `spring.datasource` | `DB_URL`의 기본값은 `jdbc:postgresql://localhost:5433/tabula_ignium`, `DB_USER`의 기본값은 `tabula_ignium`입니다. `DB_PASSWORD`는 환경 변수로 지정합니다. |
| `spring.flyway.enabled: false` | DB용 Compose의 Flyway가 마이그레이션을 실행합니다. |
| `spring.jpa.open-in-view: false` | HTTP 요청 전체에 JPA 영속성 컨텍스트를 열어 두는 기능을 비활성화합니다. |
| `spring.jpa.hibernate.ddl-auto: validate` | 시작 시 Hibernate가 엔티티 매핑과 DB 스키마가 맞는지 검사합니다. |
| `mybatis.mapper-locations` | `src/main/resources/mapper/`와 하위 폴더에서 Mapper XML을 찾습니다. |
| `mybatis.configuration.map-underscore-to-camel-case: true` | `created_at` 같은 컬럼 이름을 `createdAt` 같은 Java 속성에 매핑합니다. |

## 데이터 접근

- **JPA**는 엔티티 저장·수정·삭제 및 간단한 조회에 사용합니다. 엔티티와 `JpaRepository`는 `com.tabulaignium.api` 하위에 둡니다.
- **MyBatis**는 조건 검색, 조인, 집계에 사용합니다. 인터페이스에 `@Mapper`를 붙이고 XML을 `src/main/resources/mapper/`에 둡니다. XML의 `namespace`는 인터페이스의 전체 클래스명입니다.
- **Flyway**는 스키마 변경을 관리합니다. DB 변경 SQL은 저장소의 `infra/db/migrations/`에 다음 버전으로 추가합니다. Hibernate는 시작 시 엔티티 매핑을 검증합니다.
- 한 서비스 작업에서 JPA와 MyBatis를 함께 쓰면 서비스 메서드에 Spring의 `@Transactional`을 적용합니다. MyBatis가 같은 트랜잭션에서 JPA의 변경을 바로 읽어야 하면 조회 전에 JPA를 플러시합니다.
