# 백엔드 배포

## 1. RDS와 EC2 준비

1. EC2에서 Java 21, AWS CLI v2, SSM Agent를 사용할 수 있는지 확인합니다. Systems Manager에서 대상 EC2가 온라인 상태로 표시되어야 합니다. EC2의 8080 포트는 Spring Boot 서비스가 사용합니다.
2. EC2가 비공개 RDS에 접속할 수 있게 구성하고, 앱용 데이터베이스를 만듭니다. PostGIS, 기초 데이터, Flyway 이력까지 포함한 초기화용 DB를 RDS에 복원한 뒤 이력을 확인합니다. 저장소의 V3·V5는 로컬 Docker의 `/region-data`에 있는 GeoJSON·CSV를 읽으므로 초기 복원에 최소한 V5까지의 이력이 필요합니다. DB 배포 계정은 이후 마이그레이션을 실행할 권한이 필요합니다.
3. EC2에 `/etc/sanbul24/api.env`를 만듭니다. root 소유로 두고 파일 권한을 `0600`으로 설정한 뒤 실제 RDS 접속 정보로 바꿉니다.

   ~~~ini
   DB_URL=jdbc:postgresql://RDS_ENDPOINT:5432/tabula_ignium?sslmode=require
   DB_USER=DB_USER
   DB_PASSWORD=DB_PASSWORD
   ~~~

## 2. AWS 권한과 GitHub 변수 설정

- 배포 아티팩트용 비공개 S3 버킷을 EC2와 같은 리전에 만듭니다.
- EC2 인스턴스 역할에 Systems Manager 관리 권한과 배포 버킷의 `backend/*`에 대한 `s3:GetObject`를 부여합니다.
- GitHub Actions용 IAM 역할은 GitHub OIDC 공급자를 신뢰하도록 설정합니다. 신뢰 정책의 `aud`는 `sts.amazonaws.com`, `sub`는 `repo:red-soups/tabula-ignium:ref:refs/heads/develop`으로 제한합니다. 이 역할에는 배포 버킷의 `backend/*`에 대한 `s3:PutObject`와 대상 EC2에 대한 `ssm:SendCommand`, `ssm:GetCommandInvocation` 권한이 필요합니다. `SendCommand` 정책에는 대상 EC2와 AWS 소유 `AWS-RunShellScript` 문서를 포함합니다.
- GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에서 아래 저장소 변수를 설정합니다. 배포 역할 ARN은 EC2와 RDS 준비를 확인한 뒤 등록합니다.

| GitHub 저장소 변수 | 값 |
| --- | --- |
| `BACKEND_AWS_REGION` | EC2 리전. 서울은 `ap-northeast-2` |
| `BACKEND_DEPLOY_BUCKET` | 배포용 S3 버킷 이름 |
| `BACKEND_EC2_INSTANCE_ID` | 배포 대상 EC2 인스턴스 ID |
| `BACKEND_DEPLOY_ROLE_ARN` | GitHub Actions용 OIDC IAM 역할 ARN |

[GitHub Actions AWS OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) · [AWS Systems Manager Run Command](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html)

## 3. 배포 결과 확인

- `develop` 대상 PR에서 백엔드·마이그레이션·배포 설정이 바뀌면 Java 21로 Maven 검증을 실행합니다. 같은 경로의 변경이 `develop`에 들어오고 배포 역할 ARN이 설정되면 CD를 실행합니다.
- CD가 실행되면 JAR과 마이그레이션 SQL이 커밋 SHA 경로로 S3에 올라갑니다. SSM이 EC2에서 릴리스를 설치하고 `sanbul24-api.service`를 시작합니다. Spring Boot가 함께 전달된 SQL로 Flyway를 실행하고, `GET /api/regions`가 대한민국 데이터를 반환하면 배포가 성공합니다.
- 실패하면 GitHub Actions에 표시된 SSM 명령 ID와 EC2에서 `sudo journalctl -u sanbul24-api.service -n 100`을 확인합니다.
- 이전 릴리스는 EC2의 `/opt/sanbul24/releases`에 남습니다. 이전 JAR로 돌아가기 전에 새 DB 스키마와의 호환성을 확인하고, 필요한 릴리스만 남도록 디스크 사용량을 관리하세요. PDF는 `/var/lib/sanbul24/documents`에 저장됩니다.

## 4. 배포 기준을 main으로 전환

1. AWS OIDC 신뢰 정책의 `sub`를 `repo:red-soups/tabula-ignium:ref:refs/heads/main`으로 바꿉니다.
2. `.github/workflows/backend-ci-cd.yml`의 `pull_request.branches`와 `push.branches`를 `[main]`으로 변경합니다.
3. 운영에 별도 AWS 환경을 쓰는 경우 GitHub 저장소 변수도 운영 대상 값으로 갱신한 후 `main`에서 첫 배포를 확인합니다.
