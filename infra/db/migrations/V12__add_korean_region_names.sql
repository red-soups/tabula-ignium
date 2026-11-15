ALTER TABLE regions ADD COLUMN name_ko VARCHAR(200);

WITH translations(name_en, name_ko) AS (VALUES
    ('Korea, South', '대한민국'),
    ('Seoul', '서울특별시'), ('Busan', '부산광역시'), ('Daegu', '대구광역시'),
    ('Incheon', '인천광역시'), ('Gwangju', '광주광역시'), ('Daejeon', '대전광역시'),
    ('Ulsan', '울산광역시'), ('Sejong', '세종특별자치시'), ('Gyeonggi', '경기도'),
    ('Gangwon', '강원특별자치도'), ('North Chungcheong', '충청북도'),
    ('South Chungcheong', '충청남도'), ('North Jeolla', '전북특별자치도'),
    ('South Jeolla', '전라남도'), ('North Gyeongsang', '경상북도'),
    ('South Gyeongsang', '경상남도'), ('Jeju', '제주특별자치도'),

    ('Andong-si', '안동시'), ('Ansan-si', '안산시'), ('Anseong-si', '안성시'),
    ('Anyang-si', '안양시'), ('Asan-si', '아산시'), ('Boeun-gun', '보은군'),
    ('Bonghwa-gun', '봉화군'), ('Boryeong-si', '보령시'), ('Boseong-gun', '보성군'),
    ('Buan-gun', '부안군'), ('Bucheon-si', '부천시'), ('Buk-gu', '북구'),
    ('Buk-gu [North Distrikt]', '북구'), ('Bupyeong-gu', '부평구'), ('Busanjin-gu', '부산진구'),
    ('Buyeo-gun', '부여군'), ('Changnyeong-gun', '창녕군'), ('Changwon-si', '창원시'),
    ('Cheonan-si', '천안시'), ('Cheongdo-gun', '청도군'), ('Cheongju-si', '청주시'),
    ('Cheongsong-gun', '청송군'), ('Cheongyang-gun', '청양군'), ('Cheorwon-gun', '철원군'),
    ('Chilgok-gun', '칠곡군'), ('Chuncheon-si', '춘천시'), ('Chungju-si', '충주시'),
    ('Daedeok-gu', '대덕구'), ('Dalseo-gu', '달서구'), ('Dalseong-gun', '달성군'),
    ('Damyang-gun', '담양군'), ('Dangjin-si', '당진시'), ('Danyang-gun', '단양군'),
    ('Dobong-gu', '도봉구'), ('Dongdaemun-gu', '동대문구'), ('Dongducheon-si', '동두천시'),
    ('Dong-gu', '동구'), ('Dong-gu [East District]', '동구'), ('Donghae-si', '동해시'),
    ('Dongjak-gu', '동작구'), ('Dongnae-gu', '동래구'), ('Eumseong-gun', '음성군'),
    ('Eunpyeong-gu', '은평구'), ('Gangbuk-gu', '강북구'), ('Gangdong-gu', '강동구'),
    ('Ganghwa-gun', '강화군'), ('Gangjin-gun', '강진군'), ('Gangnam-gu', '강남구'),
    ('Gangneung-si', '강릉시'), ('Gangseo-gu', '강서구'), ('Gapyeong-gun', '가평군'),
    ('Geochang-gun', '거창군'), ('Geoje-si', '거제시'), ('Geumcheon-gu', '금천구'),
    ('Geumjeong-gu', '금정구'), ('Geumsan-gun', '금산군'), ('Gijang-gun', '기장군'),
    ('Gimcheon-si', '김천시'), ('Gimhae-si', '김해시'), ('Gimje-si', '김제시'),
    ('Gimpo-si', '김포시'), ('Gochang-gun', '고창군'), ('Goesan-gun', '괴산군'),
    ('Goheung-gun', '고흥군'), ('Gokseong-gun', '곡성군'), ('Gongju-si', '공주시'),
    ('Goryeong-gun', '고령군'), ('Goseong-gun', '고성군'), ('Goyang-si', '고양시'),
    ('Gumi-si', '구미시'), ('Gunpo-si', '군포시'), ('Gunsan-si', '군산시'),
    ('Gunwi-gun', '군위군'), ('Guri-si', '구리시'), ('Guro-gu', '구로구'),
    ('Gurye-gun', '구례군'), ('Gwacheon-si', '과천시'), ('Gwanak-gu', '관악구'),
    ('Gwangjin-gu', '광진구'), ('Gwangju-si', '광주시'), ('Gwangmyeong-si', '광명시'),
    ('Gwangsan-gu', '광산구'), ('Gwangyang-si', '광양시'), ('Gyeongju-si', '경주시'),
    ('Gyeongsan-si', '경산시'), ('Gyeryong-si', '계룡시'), ('Gyeyang-gu', '계양구'),
    ('Hadong-gun', '하동군'), ('Haenam-gun', '해남군'), ('Haeundae-gu', '해운대구'),
    ('Haman-gun', '함안군'), ('Hampyeong-gun', '함평군'), ('Hamyang-gun', '함양군'),
    ('Hanam-si', '하남시'), ('Hapcheon-gun', '합천군'), ('Hoengseong-gun', '횡성군'),
    ('Hongcheon-gun', '홍천군'), ('Hongseong-gun', '홍성군'), ('Hwacheon-gun', '화천군'),
    ('Hwaseong-si', '화성시'), ('Hwasun-gun', '화순군'), ('Icheon-si', '이천시'),
    ('Iksan-si', '익산시'), ('Imsil-gun', '임실군'), ('Inje-gun', '인제군'),
    ('Jangheung-gun', '장흥군'), ('Jangseong-gun', '장성군'), ('Jangsu-gun', '장수군'),
    ('Jecheon-si', '제천시'), ('Jeju-si', '제주시'), ('Jeongeup-si', '정읍시'),
    ('Jeongseon-gun', '정선군'), ('Jeonju-si', '전주시'), ('Jeungpyeong-gun', '증평군'),
    ('Jinan-gun', '진안군'), ('Jincheon-gun', '진천군'), ('Jindo-gun', '진도군'),
    ('Jinju-si', '진주시'), ('Jongno-gu', '종로구'), ('Jung-gu', '중구'),
    ('Jung-gu [Central District]', '중구'), ('Jungnang-gu', '중랑구'),
    ('Mapo-gu', '마포구'), ('Michuhol-gu [Nam-gu]', '미추홀구'), ('Miryang-si', '밀양시'),
    ('Mokpo-si', '목포시'), ('Muan-gun', '무안군'), ('Muju-gun', '무주군'),
    ('Mungyeong-si', '문경시'), ('Naju-si', '나주시'), ('Namdong-gu', '남동구'),
    ('Nam-gu [South District]', '남구'), ('Namhae-gun', '남해군'), ('Namwon-si', '남원시'),
    ('Namyangju-si', '남양주시'), ('Nonsan-si', '논산시'), ('Nowon-gu', '노원구'),
    ('Okcheon-gun', '옥천군'), ('Ongjin-gun', '옹진군'), ('Osan-si', '오산시'),
    ('Paju-si', '파주시'), ('Pocheon-si', '포천시'), ('Pohang-si', '포항시'),
    ('Pyeongchang-gun', '평창군'), ('Pyeongtaek-si', '평택시'), ('Sacheon-si', '사천시'),
    ('Saha-gu', '사하구'), ('Samcheok-si', '삼척시'), ('Sancheong-gun', '산청군'),
    ('Sangju-si', '상주시'), ('Sasang-gu', '사상구'), ('Sejong-si', '세종시'),
    ('Seocheon-gun', '서천군'), ('Seocho-gu', '서초구'), ('Seodaemun-gu', '서대문구'),
    ('Seo-gu', '서구'), ('Seo-gu [West District]', '서구'), ('Seogwipo-si', '서귀포시'),
    ('Seongbuk-gu', '성북구'), ('Seongdong-gu', '성동구'), ('Seongju-gun', '성주군'),
    ('Seongnam-si', '성남시'), ('Seosan-si', '서산시'), ('Siheung-si', '시흥시'),
    ('Sinan-gun', '신안군'), ('Sokcho-si', '속초시'), ('Songpa-gu', '송파구'),
    ('Sunchang-gun', '순창군'), ('Suncheon-si', '순천시'), ('Suseong-gu', '수성구'),
    ('Suwon-si', '수원시'), ('Suyeong-gu', '수영구'), ('Taean-gun', '태안군'),
    ('Taebaek-si', '태백시'), ('Tongyeong-si', '통영시'), ('Uijeongbu-si', '의정부시'),
    ('Uiryeong-gun', '의령군'), ('Uiseong-gun', '의성군'), ('Uiwang-si', '의왕시'),
    ('Uljin-gun', '울진군'), ('Ulju-gun', '울주군'), ('Ulleung-gun', '울릉군'),
    ('Wando-gun', '완도군'), ('Wanju-gun', '완주군'), ('Wonju-si', '원주시'),
    ('Yangcheon-gu', '양천구'), ('Yanggu-gun', '양구군'), ('Yangju-si', '양주시'),
    ('Yangpyeong-gun', '양평군'), ('Yangsan-si', '양산시'), ('Yangyang-gun', '양양군'),
    ('Yecheon-gun', '예천군'), ('Yeoju', '여주시'), ('Yeoncheon-gun', '연천군'),
    ('Yeongam-gun', '영암군'), ('Yeongcheon-si', '영천시'), ('Yeongdeok-gun', '영덕군'),
    ('Yeongdeungpo-gu', '영등포구'), ('Yeongdo-gu', '영도구'), ('Yeongdong-gun', '영동군'),
    ('Yeongju-si', '영주시'), ('Yeongwol-gun', '영월군'), ('Yeongyang-gun', '영양군'),
    ('Yeonje-gu', '연제구'), ('Yeonsu-gu', '연수구'), ('Yeosu-si', '여수시'),
    ('Yesan-gun', '예산군'), ('Yongin-si', '용인시'), ('Yongsan-gu', '용산구'),
    ('Yuseong-gu', '유성구')
)
UPDATE regions region
SET name_ko = translations.name_ko
FROM translations
WHERE region.name = translations.name_en;

DO $$
DECLARE
    missing_names TEXT;
BEGIN
    SELECT string_agg(name, ', ' ORDER BY name)
      INTO missing_names
      FROM regions
     WHERE name_ko IS NULL;

    IF missing_names IS NOT NULL THEN
        RAISE EXCEPTION 'Missing Korean region translations: %', missing_names;
    END IF;
END $$;

ALTER TABLE regions ALTER COLUMN name_ko SET NOT NULL;
CREATE INDEX idx_regions_parent_name_ko ON regions (parent_region_id, name_ko);

COMMENT ON COLUMN regions.name IS '원본 영문 행정구역명';
COMMENT ON COLUMN regions.name_ko IS 'UI 표시용 한글 행정구역명';
